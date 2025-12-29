import { Request, Response } from 'express';
import { TodayResponse } from '../types';
import { getBundle, getConversation, getActiveArc, validateDateId } from '../utils/firestore';
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

export async function handleGetToday(req: Request, res: Response): Promise<void> {
  try {
    const dateParam = req.query.date as string;
    if (!dateParam) {
      res.status(400).json({ error: 'Date parameter is required. Please refresh the page.' });
      return;
    }
    const todayId = validateDateId(dateParam);

    // Get or generate today's bundle
    let bundle = await getBundle(todayId);

    if (!bundle) {
      bundle = await generateDailyBundle(todayId);
    }

    // Get conversation if any
    const conversation = await getConversation(todayId);

    // Get current arc
    const arc = await getActiveArc();

    if (!arc) {
      res.status(500).json({ error: 'No active arc found. Please create an arc in Firestore.' });
      return;
    }

    const response: TodayResponse = {
      bundle,
      conversation,
      arc,
    };

    res.json(response);
  } catch (error) {
    console.error('Error in GET /api/today:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
}
