import {
  DailyBundle,
  Conversation,
  SessionInsights,
  SuggestedReading,
  LLMInsightsExtraction,
} from '../types';
import {
  getConversation,
  updateConversation,
  createSessionInsights,
  updateBundleSuggestedReading,
  getActiveArc,
  toTimestamp,
} from '../utils/firestore';
import { generateJSON } from './anthropic';
import { resolveReadingUrl } from './linkValidator';

const EXTRACTION_SYSTEM_PROMPT = `You extract insights from Personal Primer conversations.

Your goal is to identify:
1. Meaningful connections the user made between concepts, domains, or ideas
2. New interests or curiosities revealed during the conversation
3. Personal background, expertise, or preferences shared
4. Specific artifacts, ideas, or questions worth revisiting later
5. One piece of suggested further reading that would enrich the user's exploration

Be selective. Only extract genuinely valuable insights that would help future curation.
If the conversation was brief or surface-level, arrays may be empty.

For the suggested reading: choose ONE Wikipedia article, academic paper, book, or essay that directly connects to something the user expressed interest in or wondered about. The reading should feel like a natural next step, not a homework assignment. If the conversation was too brief or unfocused to suggest meaningful reading, set suggestedReading to null.`;

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
  "rawSummary": "2-3 sentence summary of the conversation's substance",
  "suggestedReading": {
    "title": "exact title of the Wikipedia article, paper, or book",
    "searchQuery": "search query to find this resource online",
    "rationale": "1-2 sentences explaining why this connects to the user's interests"
  }
}

Note: set "suggestedReading" to null if no meaningful reading suggestion emerges from the conversation.`;
}

interface ExtractionResult {
  insights: SessionInsights;
  suggestedReading: SuggestedReading | null;
}

export async function extractInsights(bundleId: string, bundle: DailyBundle): Promise<ExtractionResult | null> {
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

  // Process suggested reading if present
  let suggestedReading: SuggestedReading | null = null;
  if (extraction.suggestedReading) {
    const resolved = await resolveReadingUrl(
      extraction.suggestedReading.title,
      extraction.suggestedReading.searchQuery
    );

    if (resolved) {
      suggestedReading = {
        title: extraction.suggestedReading.title,
        url: resolved.url,
        rationale: extraction.suggestedReading.rationale,
      };

      // Update bundle with suggested reading
      await updateBundleSuggestedReading(bundleId, suggestedReading);
      console.log(`Added suggested reading to bundle ${bundleId}: ${suggestedReading.title}`);
    } else {
      console.log(`Could not resolve URL for suggested reading: ${extraction.suggestedReading.title}`);
    }
  }

  // Mark conversation as ended
  await updateConversation(bundleId, { sessionEnded: true });

  return { insights, suggestedReading };
}

export async function extractAndEndSession(bundleId: string, bundle: DailyBundle): Promise<SuggestedReading | null> {
  const conversation = await getConversation(bundleId);

  if (!conversation) {
    return null;
  }

  if (conversation.sessionEnded) {
    // Already ended - return existing suggested reading if any
    return bundle.suggestedReading || null;
  }

  if (conversation.messages.length > 0) {
    const result = await extractInsights(bundleId, bundle);
    return result?.suggestedReading || null;
  } else {
    // No messages, just mark as ended
    await updateConversation(bundleId, { sessionEnded: true });
    return null;
  }
}
