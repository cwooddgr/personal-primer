import { Request, Response } from 'express';
import { MessageRequest, MessageResponse } from '../types';
import { getBundle, getActiveArc, validateDateId } from '../utils/firestore';
import { handleMessage } from '../services/conversationManager';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('credit balance is too low')) {
      return 'Anthropic API credits depleted. Please add credits at console.anthropic.com';
    }
    if (error.message.includes('rate_limit')) {
      return 'Rate limit reached. Please try again in a few minutes.';
    }
    return error.message;
  }
  return 'Failed to process message';
}

export async function handlePostMessage(req: Request, res: Response): Promise<void> {
  try {
    const { message, date } = req.body as MessageRequest;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

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

    const arc = await getActiveArc();
    if (!arc) {
      res.status(500).json({ error: 'No active arc found' });
      return;
    }

    const { response, conversation, sessionShouldEnd } = await handleMessage(message, bundle, arc);

    const result: MessageResponse = {
      response,
      conversation,
      sessionShouldEnd,
    };

    res.json(result);
  } catch (error) {
    console.error('Error in POST /api/today/message:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
}
