import { Request, Response } from 'express';
import { getActiveArc, calculateDayInArc, getBundle } from '../utils/firestore';

function getTodayDateId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function handleGetArc(req: Request, res: Response, userId: string): Promise<void> {
  try {
    const arc = await getActiveArc(userId);

    if (!arc) {
      res.status(404).json({ error: 'No active arc found' });
      return;
    }

    // Calculate dayInArc: if today's bundle is a draft, add 1 to match framing text
    let dayInArc = await calculateDayInArc(userId, arc);
    const todayBundle = await getBundle(userId, getTodayDateId());
    if (todayBundle && todayBundle.arcId === arc.id && todayBundle.status === 'draft') {
      dayInArc += 1;
    }

    res.json({
      arc,
      dayInArc,
    });
  } catch (error) {
    console.error('Error in GET /api/arc:', error);
    res.status(500).json({ error: 'Failed to get arc' });
  }
}
