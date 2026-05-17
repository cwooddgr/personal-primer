import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { anthropicApiKey } from '../services/anthropic';
import { generateDailyBundle } from '../services/bundleGenerator';
import { getArc, getBundle, setBundleGenerationStatus } from '../utils/firestore';
import { DailyBundle } from '../types';

/**
 * Out-of-band bundle generation.
 *
 * GET /api/today never generates a bundle; it just atomically creates a
 * pending bundle document (the create is the concurrency lock). This trigger
 * fires on that document write, runs the slow web-search generation pass
 * (~30-90s) free of Firebase Hosting's 60s rewrite timeout, and fills the
 * bundle in place.
 *
 * Guard: act ONLY on the transition INTO `pending` — i.e. the doc exists,
 * `after.generationStatus === 'pending'`, and the previous state was not
 * `pending`. This prevents the trigger from re-firing on its own writes
 * (status → generating → ready/failed).
 */
export const bundleGenerator = onDocumentWritten(
  {
    document: 'users/{userId}/dailyBundles/{bundleId}',
    secrets: [anthropicApiKey],
    timeoutSeconds: 540,
    region: 'us-west3',
    memory: '256MiB',
  },
  async event => {
    const after = event.data?.after;
    if (!after?.exists) {
      return;
    }

    const afterStatus = after.data()?.generationStatus;
    const beforeStatus = event.data?.before?.exists
      ? event.data.before.data()?.generationStatus
      : undefined;

    // Only act on the transition into `pending`.
    if (afterStatus !== 'pending' || beforeStatus === 'pending') {
      return;
    }

    const { userId, bundleId } = event.params;
    console.log(
      `[bundleGenerator] Triggered for user ${userId}, bundle ${bundleId}`
    );

    // Claim the bundle: pending -> generating. This write does not re-fire the
    // trigger into generation (guard requires after === 'pending').
    await setBundleGenerationStatus(userId, bundleId, 'generating');

    // Re-read for the freshest state (engaged flag, dayInArc, etc.).
    const bundle = (await getBundle(userId, bundleId)) as DailyBundle | null;
    if (!bundle) {
      console.warn(`[bundleGenerator] Bundle ${bundleId} disappeared; aborting.`);
      return;
    }

    const arc = await getArc(userId, bundle.arcId);
    if (!arc) {
      console.error(
        `[bundleGenerator] Arc ${bundle.arcId} not found for bundle ${bundleId}; marking failed.`
      );
      await setBundleGenerationStatus(userId, bundleId, 'failed', {
        incrementAttempts: true,
      });
      return;
    }

    // generateDailyBundle handles its own success/failure status writes.
    try {
      await generateDailyBundle(userId, bundle, arc);
    } catch (err) {
      // Already marked 'failed' inside generateDailyBundle; log and swallow so
      // the trigger does not retry on its own.
      console.error(`[bundleGenerator] Generation error for ${bundleId}:`, err);
    }
  }
);
