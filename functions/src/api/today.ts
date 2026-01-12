import { Request, Response } from 'express';
import { TodayResponse } from '../types';
import { getBundle, getConversation, getActiveArc, validateDateId, calculateDayInArc, createWelcomeArc, getUserTone } from '../utils/firestore';
import { generateDailyBundle } from '../services/bundleGenerator';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for Anthropic API errors
    if (error.message.includes('credit balance is too low')) {
      return 'Anthropic API credits depleted. Please add credits at console.anthropic.com';
    }
    if (error.message.includes('invalid_api_key') || error.message.includes('authentication')) {
      return 'Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY secret.';
    }
    if (error.message.includes('rate_limit')) {
      return 'Anthropic API rate limit reached. Please try again in a few minutes.';
    }
    // Check for Google Search errors
    if (error.message.includes('Google Search API')) {
      return 'Google Search API error. Please check your GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX secrets.';
    }
    return error.message;
  }
  return 'An unexpected error occurred';
}

export async function handleGetToday(req: Request, res: Response, userId: string): Promise<void> {
  try {
    const dateParam = req.query.date as string;
    if (!dateParam) {
      res.status(400).json({ error: 'Date parameter is required. Please refresh the page.' });
      return;
    }
    const todayId = validateDateId(dateParam);

    // Get current arc, or create welcome arc for new users
    let arc = await getActiveArc(userId);
    if (!arc) {
      console.log(`[Today] No arc found for user ${userId}, creating welcome arc`);
      arc = await createWelcomeArc(userId);
    }

    // Get user's current tone preference
    const currentTone = await getUserTone(userId);

    // Get or generate today's bundle (arc must exist first)
    let bundle = await getBundle(userId, todayId);
    if (!bundle) {
      bundle = await generateDailyBundle(userId, todayId, currentTone);
    }

    // Get conversation if any
    const conversation = await getConversation(userId, todayId);

    const dayInArc = await calculateDayInArc(userId, arc);

    const response: TodayResponse = {
      bundle,
      conversation,
      arc,
      dayInArc,
      currentTone,
    };

    res.json(response);
  } catch (error) {
    console.error('Error in GET /api/today:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
}
