import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

export const MODEL = 'claude-opus-4-7';

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

/**
 * Simple text chat. Returns the concatenated text blocks of the reply.
 */
export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number = 2048
): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const text = extractText(response.content);
  if (!text) {
    throw new Error('No text response from Claude');
  }
  return text;
}

/**
 * Concatenate all text blocks from a content array.
 */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

/**
 * Extract a JSON object/array from a string that may contain surrounding text
 * or markdown fences.
 */
export function extractJSON<T>(raw: string): T {
  let jsonStr = raw.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const jsonStart = jsonStr.search(/[{[]/);
    if (jsonStart !== -1) {
      jsonStr = jsonStr.slice(jsonStart);
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
 * Plain JSON generation (no tools). Used for prompts that don't need web search.
 */
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
  return extractJSON<T>(response);
}

// ---------------------------------------------------------------------------
// Web search server tool
// ---------------------------------------------------------------------------

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 8,
};

/**
 * Run a request with the web_search server tool enabled. Handles the
 * `pause_turn` stop reason by re-calling with the accumulated content until
 * the model reaches `end_turn`. Returns the concatenated final text blocks.
 */
export async function chatWithWebSearch(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 6000
): Promise<string> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools: [WEB_SEARCH_TOOL],
    messages,
  });

  // Handle pause_turn: append assistant content and continue.
  let guard = 0;
  while (response.stop_reason === 'pause_turn' && guard < 5) {
    guard++;
    messages.push({ role: 'assistant', content: response.content });
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL],
      messages,
    });
  }

  return extractText(response.content);
}

/**
 * Run a web-search-backed request and extract JSON from the final text.
 */
export async function generateJSONWithWebSearch<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 6000
): Promise<T> {
  const text = await chatWithWebSearch(systemPrompt, userPrompt, maxTokens);
  return extractJSON<T>(text);
}

// ---------------------------------------------------------------------------
// Client-side tool-use loop
// ---------------------------------------------------------------------------

export interface ClientTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<string> | string;

export interface ToolUseLoopResult {
  text: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

/**
 * Run a conversation with client-side tools. Executes registered handlers for
 * any `tool_use` blocks and feeds `tool_result` blocks back until the model
 * reaches `end_turn`. Returns the final text and a record of tool calls made.
 */
export async function runToolUseLoop(
  systemPrompt: string,
  initialMessages: ChatMessage[],
  tools: ClientTool[],
  handlers: Record<string, ToolHandler>,
  maxTokens: number = 2048
): Promise<ToolUseLoopResult> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = initialMessages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const toolDefs: Anthropic.ToolUnion[] = tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let guard = 0;

  while (guard < 8) {
    guard++;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: toolDefs,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      return { text: extractText(response.content), toolCalls };
    }

    // Record the assistant's turn (including the tool_use blocks).
    messages.push({ role: 'assistant', content: response.content });

    // Run handlers and build tool_result blocks.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const input = (block.input || {}) as Record<string, unknown>;
      toolCalls.push({ name: block.name, input });

      const handler = handlers[block.name];
      let resultText = 'ok';
      if (handler) {
        try {
          resultText = await handler(input);
        } catch (err) {
          resultText = `Error running tool: ${
            err instanceof Error ? err.message : 'unknown error'
          }`;
        }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultText,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Loop guard exhausted.
  return { text: '', toolCalls };
}

// Token estimation (rough approximation)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

export { anthropicApiKey };
