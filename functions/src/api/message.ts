import { Request, Response } from 'express';
import { MessageRequest, MessageResponse } from '../types';
import { getBundle, getActiveArc, getTodayId } from '../utils/firestore';
import { handleMessage } from '../services/conversationManager';

export async function handlePostMessage(req: Request, res: Response): Promise<void> {
  try {
    const { message } = req.body as MessageRequest;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const todayId = getTodayId();
    const bundle = await getBundle(todayId);

    if (!bundle) {
      res.status(404).json({ error: 'No bundle found for today' });
      return;
    }

    const arc = await getActiveArc();
    if (!arc) {
      res.status(500).json({ error: 'No active arc found' });
      return;
    }

    const { response, conversation } = await handleMessage(message, bundle, arc);

    const result: MessageResponse = {
      response,
      conversation,
    };

    res.json(result);
  } catch (error) {
    console.error('Error in POST /api/today/message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
}
