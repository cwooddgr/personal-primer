import { Request, Response } from 'express';
import { getBundle, getTodayId } from '../utils/firestore';
import { extractAndEndSession } from '../services/insightExtractor';

export async function handleEndSession(req: Request, res: Response): Promise<void> {
  try {
    const todayId = getTodayId();
    const bundle = await getBundle(todayId);

    if (!bundle) {
      res.status(404).json({ error: 'No bundle found for today' });
      return;
    }

    await extractAndEndSession(todayId, bundle);

    res.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/today/end-session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
}
