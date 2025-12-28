import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: anthropicApiKey.value(),
    });
  }
  return client;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number = 2048
): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5-20251101',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  return textBlock.text;
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096
): Promise<T> {
  const response = await chat(
    systemPrompt + '\n\nYou must respond with valid JSON only, no other text.',
    [{ role: 'user', content: userPrompt }],
    maxTokens
  );

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = response.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  return JSON.parse(jsonStr) as T;
}

// Token estimation (rough approximation)
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

export { anthropicApiKey };
