import { Request, Response } from 'express';
import { ReactRequest } from '../types';
import {
  createReaction,
  getActiveArc,
  getLatestBundleForArc,
  getBundle,
  toTimestamp,
} from '../utils/firestore';

export async function handleReact(
  req: Request,
  res: Response,
  userId: string
): Promise<void> {
  try {
    const { artifactType, reactionType, notes } = req.body as ReactRequest;
    const { bundleId } = req.body as { bundleId?: string };

    if (!reactionType) {
      res.status(400).json({ error: 'reactionType is required' });
      return;
    }

    const validReactionTypes = [
      'awe',
      'interest',
      'resistance',
      'familiarity',
      'freeform',
    ];
    if (!validReactionTypes.includes(reactionType)) {
      res.status(400).json({ error: 'Invalid reactionType' });
      return;
    }

    // Resolve the bundle being reacted to.
    let bundle = bundleId ? await getBundle(userId, bundleId) : null;
    if (!bundle) {
      const arc = await getActiveArc(userId);
      if (arc) {
        bundle = await getLatestBundleForArc(userId, arc.id);
      }
    }

    if (!bundle) {
      res.status(404).json({ error: 'No bundle found to react to' });
      return;
    }

    await createReaction(userId, {
      date: toTimestamp(new Date()),
      bundleId: bundle.id,
      artifactType,
      reactionType,
      notes,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[React] Error in POST /api/today/react:', error);
    res.status(500).json({ error: 'Failed to record reaction' });
  }
}
