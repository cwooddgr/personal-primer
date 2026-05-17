import { Request, Response } from 'express';
import { getConversation, getBundle, getArc, getArcBundles } from '../utils/firestore';

/**
 * GET /api/history/:bundleId/conversation
 *
 * Identity is now bundle-based. For best-effort legacy support, the path
 * segment may also be a legacy date-keyed bundle id (YYYY-MM-DD) — both are
 * looked up the same way since they are document ids.
 */
export async function handleGetConversation(
  req: Request,
  res: Response,
  userId: string
): Promise<void> {
  try {
    const pathParts = req.path.split('/');
    const historyIndex = pathParts.indexOf('history');
    const bundleId = pathParts[historyIndex + 1];

    if (!bundleId) {
      res.status(400).json({ error: 'Bundle identifier is required' });
      return;
    }

    const [conversation, bundle] = await Promise.all([
      getConversation(userId, bundleId),
      getBundle(userId, bundleId),
    ]);

    if (!bundle) {
      res.status(404).json({ error: 'Bundle not found' });
      return;
    }

    const arc = await getArc(userId, bundle.arcId);

    // Day in arc: prefer the bundle's own field; fall back to position.
    let dayInArc = bundle.dayInArc || 1;
    if (!bundle.dayInArc && arc) {
      const arcBundles = await getArcBundles(userId, arc.id);
      const idx = arcBundles.findIndex(b => b.id === bundle.id);
      dayInArc = idx >= 0 ? idx + 1 : 1;
    }

    res.json({
      conversation,
      bundle,
      arc: arc
        ? {
            id: arc.id,
            theme: arc.theme,
            description: arc.description,
            shortDescription: arc.shortDescription,
            targetDurationDays: arc.targetDurationDays,
          }
        : null,
      dayInArc,
    });
  } catch (error) {
    console.error('[ConversationHistory] Error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
}
