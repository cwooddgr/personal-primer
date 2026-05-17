import { Request, Response } from 'express';
import { TodayResponse } from '../types';
import {
  getActiveArc,
  getActiveSeason,
  getConversation,
  getCurrentUnengagedBundle,
  calculateDayInArc,
  createPendingBundle,
  resetBundleToPending,
  setBundleGenerationStatus,
  isBundleStale,
  isBundleGenerationStuck,
} from '../utils/firestore';
import { planNextSeason } from '../services/seasonPlanner';

const MAX_GENERATION_ATTEMPTS = 3;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('credit balance is too low')) {
      return 'Anthropic API credits depleted. Please add credits at console.anthropic.com';
    }
    if (
      error.message.includes('invalid_api_key') ||
      error.message.includes('authentication')
    ) {
      return 'Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY secret.';
    }
    if (error.message.includes('rate_limit')) {
      return 'Anthropic API rate limit reached. Please try again in a few minutes.';
    }
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Non-blocking. This handler never generates a bundle itself — bundle
 * generation is done out-of-band by the `bundleGenerator` Firestore trigger.
 *
 * Behaviour:
 * - ready bundle  → return { status: 'ready', ... }
 * - missing       → atomically create a pending bundle, return 'generating'
 * - pending/gen   → return 'generating'
 * - stale un-engaged ready bundle → reset to pending, return 'generating'
 * - failed (< 3 attempts) → reset to pending (auto-retry), return 'generating'
 * - failed (>= 3 attempts) → return 'failed'
 *
 * Season planning stays synchronous: it is ~30s, under Hosting's 60s cap.
 */
export async function handleGetToday(
  req: Request,
  res: Response,
  userId: string
): Promise<void> {
  try {
    // Ensure the user has a season; plan season 1 on first load.
    let season = await getActiveSeason(userId);
    if (!season) {
      console.log(`[Today] No season for user ${userId}; planning season 1.`);
      await planNextSeason(userId);
      season = await getActiveSeason(userId);
    }

    const arc = await getActiveArc(userId);
    if (!arc) {
      res.status(500).json({ error: 'No active arc found for this season.' });
      return;
    }

    // Resolve today's encounter: at most one un-engaged bundle per user.
    const bundle = await getCurrentUnengagedBundle(userId, arc.id);

    if (!bundle) {
      // No un-engaged bundle. Atomically create a pending one; the create
      // throws if a concurrent request already created it — in which case the
      // other request won and we simply report 'generating'.
      const dayInArc = await calculateDayInArc(userId, arc);
      try {
        await createPendingBundle(userId, arc.id, dayInArc);
        console.log(
          `[Today] Created pending bundle for arc "${arc.theme}" day ${dayInArc}`
        );
      } catch (err) {
        // Firestore ALREADY_EXISTS (gRPC code 6) — a concurrent request won
        // the race. Any other error is a real failure; let it propagate to
        // the outer catch so the user sees an error rather than polling
        // forever against a bundle that was never created.
        if ((err as { code?: number }).code !== 6) {
          throw err;
        }
        console.log(
          `[Today] Pending bundle already exists for arc "${arc.theme}" day ${dayInArc}; another request won.`
        );
      }
      const generating: TodayResponse = { status: 'generating' };
      res.json(generating);
      return;
    }

    const status = bundle.generationStatus;

    if (status === 'pending' || status === 'generating') {
      // Watchdog: if generation has been running far longer than the trigger's
      // timeout, the trigger crashed before reaching ready/failed. Mark it
      // failed (counting an attempt) so the next poll runs the capped retry.
      if (status === 'generating' && isBundleGenerationStuck(bundle)) {
        console.warn(
          `[Today] Bundle ${bundle.id} stuck in 'generating'; marking failed for retry.`
        );
        await setBundleGenerationStatus(userId, bundle.id, 'failed', {
          incrementAttempts: true,
        });
      }
      const generating: TodayResponse = { status: 'generating' };
      res.json(generating);
      return;
    }

    if (status === 'failed') {
      if ((bundle.generationAttempts ?? 0) < MAX_GENERATION_ATTEMPTS) {
        console.log(
          `[Today] Bundle ${bundle.id} failed (attempt ${bundle.generationAttempts}); resetting to pending for retry.`
        );
        await resetBundleToPending(userId, bundle.id);
        const generating: TodayResponse = { status: 'generating' };
        res.json(generating);
      } else {
        console.warn(
          `[Today] Bundle ${bundle.id} failed ${bundle.generationAttempts} times; giving up.`
        );
        const failed: TodayResponse = { status: 'failed' };
        res.json(failed);
      }
      return;
    }

    // status === 'ready'
    if (isBundleStale(bundle)) {
      // Stale un-engaged bundle: reset to pending so the trigger regenerates
      // it in place (same id, same dayInArc, fresh content).
      console.log(
        `[Today] Resetting stale bundle ${bundle.id} (arc "${arc.theme}" day ${bundle.dayInArc}) for regeneration.`
      );
      await resetBundleToPending(userId, bundle.id);
      const generating: TodayResponse = { status: 'generating' };
      res.json(generating);
      return;
    }

    const conversation = await getConversation(userId, bundle.id);
    const response: TodayResponse = {
      status: 'ready',
      bundle,
      conversation,
      arc,
      dayInArc: bundle.dayInArc,
    };
    res.json(response);
  } catch (error) {
    console.error('[Today] Error in GET /api/today:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
}
