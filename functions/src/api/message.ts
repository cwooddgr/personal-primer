import { Request, Response } from 'express';
import { MessageRequest, MessageResponse } from '../types';
import {
  getBundle,
  getCurrentUnengagedBundle,
  getLatestBundleForArc,
  getActiveArc,
  getArc,
  engageBundle,
  getConversation,
} from '../utils/firestore';
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

export async function handlePostMessage(
  req: Request,
  res: Response,
  userId: string
): Promise<void> {
  try {
    const { message, bundleId } = req.body as MessageRequest;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const arc = await getActiveArc(userId);
    if (!arc) {
      res.status(500).json({ error: 'No active arc found' });
      return;
    }

    // Resolve the bundle: explicit bundleId, else the current un-engaged
    // bundle, else the latest bundle of the active arc (for follow-up messages
    // after the bundle was already engaged by the first message).
    let bundle = bundleId
      ? await getBundle(userId, bundleId)
      : (await getCurrentUnengagedBundle(userId, arc.id)) ||
        (await getLatestBundleForArc(userId, arc.id));

    if (!bundle) {
      res.status(404).json({ error: 'No bundle found for today' });
      return;
    }

    // The bundle's arc drives the conversation context (it may be a prior arc
    // if the user is finishing a conversation after the arc advanced).
    const bundleArc = (await getArc(userId, bundle.arcId)) || arc;

    // First message marks the bundle engaged and creates exposures.
    const existingConversation = await getConversation(userId, bundle.id);
    if (!existingConversation) {
      await engageBundle(userId, bundle);
      bundle = { ...bundle, engaged: true };
    }

    const { response, conversation, sessionShouldEnd, arcShouldEnd } =
      await handleMessage(userId, message, bundle, bundleArc);

    const result: MessageResponse = {
      response,
      conversation,
      sessionShouldEnd,
      arcShouldEnd,
    };
    res.json(result);
  } catch (error) {
    console.error('[Message] Error in POST /api/today/message:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
}
