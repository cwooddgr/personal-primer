import { Request, Response } from 'express';
import { getBundle, validateDateId } from '../utils/firestore';
import { extractAndEndSession } from '../services/insightExtractor';
import { EndSessionResponse } from '../types';

export async function handleEndSession(req: Request, res: Response): Promise<void> {
  try {
    const { date } = req.body as { date: string };
    if (!date) {
      res.status(400).json({ error: 'Date parameter is required. Please refresh the page.' });
      return;
    }
    const todayId = validateDateId(date);
    const bundle = await getBundle(todayId);

    if (!bundle) {
      res.status(404).json({ error: 'No bundle found for today' });
      return;
    }

    const suggestedReading = await extractAndEndSession(todayId, bundle);

    const response: EndSessionResponse = {
      success: true,
      suggestedReading: suggestedReading || undefined,
    };

    res.json(response);
  } catch (error) {
    console.error('Error in POST /api/today/end-session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
}
