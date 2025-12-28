import { Request, Response } from 'express';
import { getActiveArc, calculateDayInArc } from '../utils/firestore';

export async function handleGetArc(req: Request, res: Response): Promise<void> {
  try {
    const arc = await getActiveArc();

    if (!arc) {
      res.status(404).json({ error: 'No active arc found' });
      return;
    }

    const dayInArc = calculateDayInArc(arc);

    res.json({
      arc,
      dayInArc,
    });
  } catch (error) {
    console.error('Error in GET /api/arc:', error);
    res.status(500).json({ error: 'Failed to get arc' });
  }
}
