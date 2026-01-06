import { Request, Response } from 'express';
import { HistoryQuery, DailyBundle } from '../types';
import { getBundleHistory, getArc } from '../utils/firestore';

interface ArcWithBundles {
  arc: {
    id: string;
    theme: string;
    description: string;
  };
  bundles: DailyBundle[];
}

export async function handleGetHistory(req: Request, res: Response): Promise<void> {
  try {
    const { limit, before } = req.query as unknown as HistoryQuery;

    const parsedLimit = limit ? Math.min(Math.max(1, Number(limit)), 100) : 30;

    const bundles = await getBundleHistory(parsedLimit, before);

    // Group bundles by arcId
    const bundlesByArc = new Map<string, DailyBundle[]>();
    const arcOrder: string[] = [];

    for (const bundle of bundles) {
      if (!bundlesByArc.has(bundle.arcId)) {
        bundlesByArc.set(bundle.arcId, []);
        arcOrder.push(bundle.arcId);
      }
      bundlesByArc.get(bundle.arcId)!.push(bundle);
    }

    // Fetch arc info for each unique arcId
    const arcGroups: ArcWithBundles[] = [];
    for (const arcId of arcOrder) {
      const arc = await getArc(arcId);
      arcGroups.push({
        arc: arc ? {
          id: arc.id,
          theme: arc.theme,
          description: arc.description,
        } : {
          id: arcId,
          theme: 'Unknown Arc',
          description: '',
        },
        bundles: bundlesByArc.get(arcId)!,
      });
    }

    res.json({ arcGroups, bundles });
  } catch (error) {
    console.error('Error in GET /api/history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
}
