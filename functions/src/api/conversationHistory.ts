import { Request, Response } from 'express';
import { getConversation, validateDateId } from '../utils/firestore';

export async function handleGetConversation(req: Request, res: Response): Promise<void> {
  try {
    // Extract date from path: /api/history/:date/conversation
    const pathParts = req.path.split('/');
    const dateIndex = pathParts.indexOf('history') + 1;
    const date = pathParts[dateIndex];

    const validatedDate = validateDateId(date);
    const conversation = await getConversation(validatedDate);

    res.json({ conversation });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Date')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Error in GET /api/history/:date/conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
}
