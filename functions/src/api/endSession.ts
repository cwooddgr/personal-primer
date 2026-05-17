import { Request, Response } from 'express';
import { getBundle, getLatestBundleForArc, getActiveArc } from '../utils/firestore';
import { extractAndEndSession } from '../services/insightExtractor';
import { EndSessionResponse } from '../types';

/**
 * Resolve the bundle for a session-end request. Prefers an explicit bundleId;
 * otherwise uses the latest bundle of the active arc (engaged or not).
 */
async function resolveBundle(userId: string, bundleId?: string) {
  if (bundleId) {
    return getBundle(userId, bundleId);
  }
  const arc = await getActiveArc(userId);
  if (!arc) return null;
  return getLatestBundleForArc(userId, arc.id);
}

export async function handleEndSession(
  req: Request,
  res: Response,
  userId: string
): Promise<void> {
  try {
    const { bundleId } = req.body as { bundleId?: string };
    const bundle = await resolveBundle(userId, bundleId);

    if (!bundle) {
      res.status(404).json({ error: 'No bundle found for today' });
      return;
    }

    const result = await extractAndEndSession(userId, bundle.id, bundle);

    const response: EndSessionResponse = {
      success: true,
      suggestedReading: result.suggestedReading || undefined,
      arcCompletion: result.arcCompletion || undefined,
    };
    res.json(response);
  } catch (error) {
    console.error('[EndSession] Error in POST /api/today/end-session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
}
