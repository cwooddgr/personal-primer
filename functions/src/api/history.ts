import { Request, Response } from 'express';
import { HistoryQuery } from '../types';
import { getBundleHistory } from '../utils/firestore';

export async function handleGetHistory(req: Request, res: Response): Promise<void> {
  try {
    const { limit, before } = req.query as unknown as HistoryQuery;

    const parsedLimit = limit ? Math.min(Math.max(1, Number(limit)), 100) : 30;

    const bundles = await getBundleHistory(parsedLimit, before);

    res.json({ bundles });
  } catch (error) {
    console.error('Error in GET /api/history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
}
