import { Request, Response } from 'express';
import { getConversation, validateDateId, getBundle, getArc, getArcBundles } from '../utils/firestore';

export async function handleGetConversation(req: Request, res: Response, userId: string): Promise<void> {
  try {
    // Extract date from path: /api/history/:date/conversation
    const pathParts = req.path.split('/');
    const dateIndex = pathParts.indexOf('history') + 1;
    const date = pathParts[dateIndex];

    const validatedDate = validateDateId(date);

    // Fetch conversation, bundle, and arc info
    const [conversation, bundle] = await Promise.all([
      getConversation(userId, validatedDate),
      getBundle(userId, validatedDate),
    ]);

    if (!bundle) {
      res.status(404).json({ error: 'Bundle not found for this date' });
      return;
    }

    const arc = await getArc(userId, bundle.arcId);

    // Calculate day in arc (position of this bundle within the arc)
    let dayInArc = 1;
    if (arc) {
      const arcBundles = await getArcBundles(userId, arc.id);
      const bundleIndex = arcBundles.findIndex(b => b.id === bundle.id);
      dayInArc = bundleIndex >= 0 ? bundleIndex + 1 : 1;
    }

    res.json({
      conversation,
      bundle,
      arc: arc ? {
        id: arc.id,
        theme: arc.theme,
        description: arc.description,
        targetDurationDays: arc.targetDurationDays,
      } : null,
      dayInArc,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Date')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Error in GET /api/history/:date/conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
}
