import {
  DailyBundle,
  Conversation,
  SessionInsights,
  LLMInsightsExtraction,
} from '../types';
import {
  getConversation,
  updateConversation,
  createSessionInsights,
  getActiveArc,
  toTimestamp,
} from '../utils/firestore';
import { generateJSON } from './anthropic';

const EXTRACTION_SYSTEM_PROMPT = `You extract insights from Personal Primer conversations.

Your goal is to identify:
1. Meaningful connections the user made between concepts, domains, or ideas
2. New interests or curiosities revealed during the conversation
3. Personal background, expertise, or preferences shared
4. Specific artifacts, ideas, or questions worth revisiting later

Be selective. Only extract genuinely valuable insights that would help future curation.
If the conversation was brief or surface-level, arrays may be empty.`;

function buildExtractionPrompt(bundle: DailyBundle, conversation: Conversation): string {
  const conversationText = conversation.messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `TODAY'S ARTIFACTS:
- Music: ${bundle.music.title} by ${bundle.music.artist}
- Image: ${bundle.image.title}${bundle.image.artist ? ` by ${bundle.image.artist}` : ''}
- Text: "${bundle.text.content.slice(0, 100)}..." — ${bundle.text.author}

CONVERSATION:
${conversationText}

Extract insights and return as JSON:
{
  "meaningfulConnections": [
    "concept or cross-domain connections the user found meaningful"
  ],
  "revealedInterests": [
    "new interests, curiosities, or directions revealed"
  ],
  "personalContext": [
    "personal background, expertise, or preferences shared"
  ],
  "revisitLater": [
    "specific artifacts, ideas, or questions worth returning to"
  ],
  "rawSummary": "2-3 sentence summary of the conversation's substance"
}`;
}

export async function extractInsights(bundleId: string, bundle: DailyBundle): Promise<SessionInsights | null> {
  const conversation = await getConversation(bundleId);

  if (!conversation || conversation.messages.length === 0) {
    return null;
  }

  const arc = await getActiveArc();
  if (!arc) {
    return null;
  }

  // Extract insights using LLM
  const extraction = await generateJSON<LLMInsightsExtraction>(
    EXTRACTION_SYSTEM_PROMPT,
    buildExtractionPrompt(bundle, conversation)
  );

  const insights: SessionInsights = {
    id: bundleId,
    date: toTimestamp(new Date()),
    arcId: arc.id,
    meaningfulConnections: extraction.meaningfulConnections || [],
    revealedInterests: extraction.revealedInterests || [],
    personalContext: extraction.personalContext || [],
    revisitLater: extraction.revisitLater || [],
    rawSummary: extraction.rawSummary || '',
  };

  await createSessionInsights(insights);

  // Mark conversation as ended
  await updateConversation(bundleId, { sessionEnded: true });

  return insights;
}

export async function extractAndEndSession(bundleId: string, bundle: DailyBundle): Promise<void> {
  const conversation = await getConversation(bundleId);

  if (!conversation) {
    return;
  }

  if (conversation.sessionEnded) {
    return; // Already ended
  }

  if (conversation.messages.length > 0) {
    await extractInsights(bundleId, bundle);
  } else {
    // No messages, just mark as ended
    await updateConversation(bundleId, { sessionEnded: true });
  }
}
