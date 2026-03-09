import { Request, Response } from 'express';
import { getBundle, validateDateId } from '../utils/firestore';
import { extractAndEndSession } from '../services/insightExtractor';
import { EndSessionResponse } from '../types';

export async function handleEndArcEarly(req: Request, res: Response, userId: string): Promise<void> {
  try {
    const { date } = req.body as { date: string };
    if (!date) {
      res.status(400).json({ error: 'Date parameter is required. Please refresh the page.' });
      return;
    }
    const todayId = validateDateId(date);
    const bundle = await getBundle(userId, todayId);

    if (!bundle) {
      res.status(404).json({ error: 'No bundle found for today' });
      return;
    }

    // End session + force arc completion regardless of day count
    const result = await extractAndEndSession(userId, todayId, bundle, true);

    const response: EndSessionResponse = {
      success: true,
      suggestedReading: result.suggestedReading || undefined,
      arcCompletion: result.arcCompletion || undefined,
    };

    res.json(response);
  } catch (error) {
    console.error('Error in POST /api/arc/end-early:', error);
    res.status(500).json({ error: 'Failed to end arc' });
  }
}
