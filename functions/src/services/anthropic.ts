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

  // Extract JSON from response (handle markdown code blocks and surrounding text)
  let jsonStr = response.trim();

  // Try to extract JSON from markdown code block first
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // Fallback: find first { or [ and extract to matching closing bracket
    const jsonStart = jsonStr.search(/[{\[]/);
    if (jsonStart !== -1) {
      jsonStr = jsonStr.slice(jsonStart);
      // Find the matching closing bracket
      const openChar = jsonStr[0];
      const closeChar = openChar === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\' && inString) {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === openChar) depth++;
          if (char === closeChar) {
            depth--;
            if (depth === 0) {
              jsonStr = jsonStr.slice(0, i + 1);
              break;
            }
          }
        }
      }
    }
  }

  return JSON.parse(jsonStr) as T;
}

/**
 * Quick check using Haiku for fast, cheap yes/no style questions.
 * Returns the raw text response.
 */
export async function quickCheck(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 256
): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  return textBlock.text;
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
