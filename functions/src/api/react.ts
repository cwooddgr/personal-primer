import { Request, Response } from 'express';
import { ReactRequest } from '../types';
import { createReaction, getTodayId, toTimestamp } from '../utils/firestore';

export async function handleReact(req: Request, res: Response, userId: string): Promise<void> {
  try {
    const { artifactType, reactionType, notes } = req.body as ReactRequest;

    if (!reactionType) {
      res.status(400).json({ error: 'reactionType is required' });
      return;
    }

    const validReactionTypes = ['awe', 'interest', 'resistance', 'familiarity', 'freeform'];
    if (!validReactionTypes.includes(reactionType)) {
      res.status(400).json({ error: 'Invalid reactionType' });
      return;
    }

    const todayId = getTodayId();

    await createReaction(userId, {
      date: toTimestamp(new Date()),
      bundleId: todayId,
      artifactType,
      reactionType,
      notes,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/today/react:', error);
    res.status(500).json({ error: 'Failed to record reaction' });
  }
}
