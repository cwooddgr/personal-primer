import { Request, Response } from 'express';
import { TodayResponse, DailyBundle } from '../types';
import {
  getActiveArc,
  getActiveSeason,
  getConversation,
  getCurrentUnengagedBundle,
  calculateDayInArc,
  createBundle,
  replaceBundleContent,
  isBundleStale,
  toTimestamp,
} from '../utils/firestore';
import { buildBundle, generateBundleContent } from '../services/bundleGenerator';
import { planNextSeason } from '../services/seasonPlanner';

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
    let bundle = await getCurrentUnengagedBundle(userId, arc.id);
    const dayInArc = await calculateDayInArc(userId, arc);

    if (bundle && isBundleStale(bundle)) {
      // Stale un-engaged bundle: regenerate in place (same id, same dayInArc).
      console.log(
        `[Today] Regenerating stale bundle ${bundle.id} (arc "${arc.theme}" day ${bundle.dayInArc})`
      );
      const content = await generateBundleContent(userId, arc, bundle.dayInArc);
      await replaceBundleContent(userId, bundle.id, {
        ...content,
        createdAt: toTimestamp(new Date()),
      });
      bundle = {
        ...bundle,
        ...content,
        createdAt: toTimestamp(new Date()),
      };
    } else if (!bundle) {
      // No un-engaged bundle: generate a fresh one for today's slot.
      console.log(
        `[Today] Generating new bundle for arc "${arc.theme}" day ${dayInArc}`
      );
      const bundleId = `bundle-${arc.id}-${dayInArc}-${Date.now()}`;
      bundle = await buildBundle(userId, bundleId, arc, dayInArc);
      await createBundle(userId, bundle);
    }

    const conversation = await getConversation(userId, bundle.id);

    const response: TodayResponse = {
      bundle: bundle as DailyBundle,
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
