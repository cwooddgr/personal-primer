import { Request, Response } from 'express';
import { TodayResponse } from '../types';
import { getBundle, getConversation, getActiveArc, getTodayId } from '../utils/firestore';
import { generateDailyBundle } from '../services/bundleGenerator';

export async function handleGetToday(req: Request, res: Response): Promise<void> {
  try {
    const todayId = getTodayId();

    // Get or generate today's bundle
    let bundle = await getBundle(todayId);

    if (!bundle) {
      bundle = await generateDailyBundle();
    }

    // Get conversation if any
    const conversation = await getConversation(todayId);

    // Get current arc
    const arc = await getActiveArc();

    if (!arc) {
      res.status(500).json({ error: 'No active arc found' });
      return;
    }

    const response: TodayResponse = {
      bundle,
      conversation,
      arc,
    };

    res.json(response);
  } catch (error) {
    console.error('Error in GET /api/today:', error);
    res.status(500).json({ error: 'Failed to get today\'s bundle' });
  }
}
