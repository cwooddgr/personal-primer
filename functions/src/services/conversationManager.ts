import {
  Arc,
  DailyBundle,
  Conversation,
  ConversationMessage,
  SessionInsights,
} from '../types';
import {
  getConversation,
  createConversation,
  updateConversation,
  getRecentInsights,
  toTimestamp,
} from '../utils/firestore';
import { chat, ChatMessage, estimateMessagesTokens } from './anthropic';
import { calculateDayInArc } from '../utils/firestore';

const MAX_CONTEXT_TOKENS = 50000;

function buildConversationSystemPrompt(
  bundle: DailyBundle,
  arc: Arc,
  dayInArc: number,
  insights: SessionInsights[]
): string {
  const insightsText = formatInsights(insights);

  return `You are the guide for Personal Primer. Today's encounter includes:

MUSIC: ${bundle.music.title} by ${bundle.music.artist}
IMAGE: ${bundle.image.title}${bundle.image.artist ? ` by ${bundle.image.artist}` : ''}
TEXT: "${bundle.text.content}" — ${bundle.text.author}, ${bundle.text.source}

FRAMING:
${bundle.framingText}

CURRENT ARC: ${arc.theme}
${arc.description}
Day ${dayInArc} of ~${arc.targetDurationDays} (${arc.currentPhase} phase)

WHAT YOU KNOW ABOUT THIS USER (from past conversations):
${insightsText || '(This is a new user, no prior insights yet)'}

YOUR ROLE:
- Engage thoughtfully about today's artifacts
- Draw connections across domains
- Be curious, not instructive
- Remember what has been discussed in this conversation
- You may reference prior days' artifacts if relevant
- Avoid over-explanation; preserve mystery and wonder
- If the user shares personal context, acknowledge it naturally

You are a guide, not a teacher. A companion in exploration, not an authority.

SESSION ENDING (CRITICAL):
When the user signals they want to end the conversation in ANY way—including phrases like "let's end here", "that's a good place to end", "good stopping point", "I'll leave it there", "that's all for today", "goodbye", "thanks, that's enough", "wrap up", etc.—you MUST:
1. Respond warmly and naturally with a farewell
2. Add the marker {{END_SESSION}} at the very end of your response

This marker is essential for the app to function. If you detect ANY intent to conclude, you MUST include {{END_SESSION}} at the end. Do not explain the marker—just include it silently after your farewell.`;
}

function formatInsights(insights: SessionInsights[]): string {
  if (!insights.length) return '';

  const allConnections: string[] = [];
  const allInterests: string[] = [];
  const allContext: string[] = [];

  for (const insight of insights) {
    allConnections.push(...insight.meaningfulConnections);
    allInterests.push(...insight.revealedInterests);
    allContext.push(...insight.personalContext);
  }

  const parts: string[] = [];

  if (allConnections.length) {
    parts.push(`Meaningful connections they've made: ${[...new Set(allConnections)].slice(0, 10).join(', ')}`);
  }
  if (allInterests.length) {
    parts.push(`Interests revealed: ${[...new Set(allInterests)].slice(0, 10).join(', ')}`);
  }
  if (allContext.length) {
    parts.push(`Personal context: ${[...new Set(allContext)].slice(0, 5).join(', ')}`);
  }

  return parts.join('\n');
}

function trimMessagesToFit(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  const trimmed = [...messages];
  while (estimateMessagesTokens(trimmed) > maxTokens && trimmed.length > 1) {
    trimmed.shift();
  }
  return trimmed;
}

const END_SESSION_MARKER = '{{END_SESSION}}';

// Fallback detection patterns
const USER_ENDING_PATTERNS = [
  /let'?s?\s+end/i,
  /that'?s?\s+all\s+for\s+today/i,
  /goodbye/i,
  /good\s*bye/i,
  /end\s+(here|there|now|the\s+session)/i,
  /stop\s+(here|there|now)/i,
  /i('?m|\s+am)\s+(done|finished)/i,
  /until\s+(next\s+time|tomorrow)/i,
  /signing\s+off/i,
];

const ASSISTANT_FAREWELL_PATTERNS = [
  /take\s+care/i,
  /until\s+(next\s+time|tomorrow|then)/i,
  /see\s+you/i,
  /farewell/i,
  /goodbye/i,
  /good\s*bye/i,
  /have\s+a\s+(good|great|wonderful|lovely)/i,
  /rest\s+well/i,
  /be\s+well/i,
];

function detectSessionEnd(userMessage: string, assistantResponse: string): boolean {
  // Primary: check for explicit marker
  if (assistantResponse.includes(END_SESSION_MARKER)) {
    return true;
  }

  // Fallback: check if user signaled ending AND assistant responded with farewell
  const userWantsToEnd = USER_ENDING_PATTERNS.some(pattern => pattern.test(userMessage));
  const assistantSaidFarewell = ASSISTANT_FAREWELL_PATTERNS.some(pattern => pattern.test(assistantResponse));

  return userWantsToEnd && assistantSaidFarewell;
}

export async function handleMessage(
  userId: string,
  userMessage: string,
  bundle: DailyBundle,
  arc: Arc
): Promise<{ response: string; conversation: Conversation; sessionShouldEnd: boolean }> {
  const bundleId = bundle.id;
  const now = toTimestamp(new Date());
  const dayInArc = await calculateDayInArc(userId, arc);
  const insights = await getRecentInsights(userId, 14);

  // Get or create conversation
  let conversation = await getConversation(userId, bundleId);

  if (!conversation) {
    conversation = {
      id: bundleId,
      bundleId,
      messages: [],
      lastActivity: now,
      sessionEnded: false,
    };
    await createConversation(userId, conversation);
  }

  // Build message history for LLM
  const chatMessages: ChatMessage[] = conversation.messages.map(m => ({
    role: m.role,
    content: m.content,
  }));
  chatMessages.push({ role: 'user', content: userMessage });

  // Trim if too long
  const trimmedMessages = trimMessagesToFit(chatMessages, MAX_CONTEXT_TOKENS);

  // Get response from Claude
  const systemPrompt = buildConversationSystemPrompt(bundle, arc, dayInArc, insights);
  let assistantResponse = await chat(systemPrompt, trimmedMessages);

  // Detect if session should end (marker or pattern matching)
  const sessionShouldEnd = detectSessionEnd(userMessage, assistantResponse);
  console.log('User message:', userMessage);
  console.log('Response end:', assistantResponse.slice(-100));
  console.log('Session should end:', sessionShouldEnd);

  // Strip marker if present
  if (assistantResponse.includes(END_SESSION_MARKER)) {
    assistantResponse = assistantResponse.replace(END_SESSION_MARKER, '').trim();
  }

  // Update conversation
  const userMsg: ConversationMessage = {
    role: 'user',
    content: userMessage,
    timestamp: now,
  };
  const assistantMsg: ConversationMessage = {
    role: 'assistant',
    content: assistantResponse,
    timestamp: toTimestamp(new Date()),
  };

  conversation.messages.push(userMsg, assistantMsg);
  conversation.lastActivity = toTimestamp(new Date());

  await updateConversation(userId, bundleId, {
    messages: conversation.messages,
    lastActivity: conversation.lastActivity,
  });

  return { response: assistantResponse, conversation, sessionShouldEnd };
}
