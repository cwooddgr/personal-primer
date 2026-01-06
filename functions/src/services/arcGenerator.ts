import { Arc, DailyBundle, SessionInsights, ArcCompletionData, Conversation } from '../types';
import {
  getArcBundles,
  getArcInsights,
  createArc,
  toTimestamp,
} from '../utils/firestore';
import { generateJSON } from './anthropic';

interface LLMArcSummary {
  summary: string;
}

interface LLMNextArc {
  theme: string;
  description: string;
  shortDescription: string;
}

const ARC_SUMMARY_SYSTEM_PROMPT = `You are reflecting on a completed thematic arc from Personal Primer, a daily intellectual formation guide.

Your task is to write a satisfying retrospective summary (2-3 paragraphs) that:
- Acknowledges the journey through this theme
- Highlights key artifacts and ideas encountered
- Connects threads that emerged across the days
- Creates a sense of meaningful closure without being sentimental
- Maintains a tone of quiet appreciation, not instruction

Write as a thoughtful companion looking back on a shared journey, not as a teacher grading a student.`;

const NEXT_ARC_SYSTEM_PROMPT = `You are designing the next thematic arc for Personal Primer, a daily intellectual formation guide.

Based on the just-completed arc, the user's revealed interests, and especially the final day's conversation, suggest a new theme that:
- Honors any explicit requests or agreements about the next theme from the conversation
- Feels like a natural progression or interesting contrast
- Opens new territory while honoring what came before
- Is broad enough for 7 days of varied artifacts (music, art, literature)
- Invites curiosity rather than demanding expertise

IMPORTANT: If the user explicitly discussed or agreed on a theme for the next arc in the final conversation, you should honor that request. The user's explicit preferences take priority over inferred interests.

Provide:
- A theme (single word or short phrase)
- A description (2-3 sentences setting the tone and scope)
- A shortDescription (ONE sentence capturing the essence, for display in the UI)`;

function buildSummaryPrompt(arc: Arc, bundles: DailyBundle[], insights: SessionInsights[]): string {
  const artifactList = bundles
    .map(b => `Day ${bundles.indexOf(b) + 1}:
  - Music: ${b.music.title} by ${b.music.artist}
  - Image: ${b.image.title}${b.image.artist ? ` by ${b.image.artist}` : ''}
  - Text: "${b.text.content.slice(0, 80)}..." — ${b.text.author}`)
    .join('\n\n');

  const userConnections = insights
    .flatMap(i => i.meaningfulConnections)
    .filter(c => c)
    .slice(0, 10);

  const userInterests = insights
    .flatMap(i => i.revealedInterests)
    .filter(i => i)
    .slice(0, 10);

  return `COMPLETED ARC: ${arc.theme}
${arc.description}

ARTIFACTS PRESENTED:
${artifactList}

USER'S MEANINGFUL CONNECTIONS:
${userConnections.length > 0 ? userConnections.map(c => `- ${c}`).join('\n') : '(none recorded)'}

USER'S REVEALED INTERESTS:
${userInterests.length > 0 ? userInterests.map(i => `- ${i}`).join('\n') : '(none recorded)'}

Write a retrospective summary. Return as JSON:
{
  "summary": "2-3 paragraphs reflecting on this arc's journey"
}`;
}

function buildNextArcPrompt(arc: Arc, insights: SessionInsights[], finalConversation: Conversation | null): string {
  const userInterests = insights
    .flatMap(i => i.revealedInterests)
    .filter(i => i);

  const userContext = insights
    .flatMap(i => i.personalContext)
    .filter(c => c);

  const conversationText = finalConversation?.messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n') || '(no conversation recorded)';

  return `JUST COMPLETED: "${arc.theme}" arc
${arc.description}

USER'S REVEALED INTERESTS (from all conversations in this arc):
${userInterests.length > 0 ? userInterests.map(i => `- ${i}`).join('\n') : '(none recorded)'}

USER'S BACKGROUND/CONTEXT:
${userContext.length > 0 ? userContext.map(c => `- ${c}`).join('\n') : '(none recorded)'}

FINAL DAY'S CONVERSATION (pay special attention to any discussion about what the next arc should be):
${conversationText}

Suggest the next arc theme. If the user expressed a preference for a specific theme in the conversation above, honor that request. Return as JSON:
{
  "theme": "single word or short phrase",
  "description": "2-3 sentences setting the tone and scope",
  "shortDescription": "ONE sentence capturing the essence"
}`;
}

export async function generateArcCompletion(arc: Arc, finalConversation: Conversation | null): Promise<ArcCompletionData> {
  // Gather all bundles and insights from this arc
  const bundles = await getArcBundles(arc.id);
  const insights = await getArcInsights(arc.id);

  // Generate retrospective summary
  const summaryResult = await generateJSON<LLMArcSummary>(
    ARC_SUMMARY_SYSTEM_PROMPT,
    buildSummaryPrompt(arc, bundles, insights)
  );

  // Generate next arc (include final conversation so explicit theme requests are honored)
  const nextArcResult = await generateJSON<LLMNextArc>(
    NEXT_ARC_SYSTEM_PROMPT,
    buildNextArcPrompt(arc, insights, finalConversation)
  );

  // Create the new arc in Firestore
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  await createArc({
    theme: nextArcResult.theme,
    description: nextArcResult.description,
    shortDescription: nextArcResult.shortDescription,
    startDate: toTimestamp(tomorrow),
    targetDurationDays: 7,
    currentPhase: 'early',
  });

  console.log(`Created new arc: "${nextArcResult.theme}"`);

  return {
    summary: summaryResult.summary,
    nextArc: {
      theme: nextArcResult.theme,
      description: nextArcResult.description,
      shortDescription: nextArcResult.shortDescription,
    },
  };
}
