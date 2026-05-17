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
 * Concatenate all text blocks from a content array.
 */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Structured output (tool-use)
// ---------------------------------------------------------------------------

export interface StructuredTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
}

/**
 * Generate structured output by forcing the model to emit exactly one tool
 * call. The tool's `input` is returned as `T` — no text parsing involved.
 */
export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  tool: StructuredTool,
  maxTokens: number = 8000
): Promise<T> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === tool.name
  );
  if (!toolUse) {
    throw new Error(`Model did not call the ${tool.name} tool`);
  }
  return toolUse.input as T;
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
 * Generate structured output from a web-search-backed request. The model has
 * both the `web_search` server tool and a `submitTool` for emitting the final
 * result. `tool_choice` is left as auto (it cannot be forced while `web_search`
 * must remain usable). Handles the `pause_turn` stop reason by re-calling with
 * accumulated content. When the model calls `submitTool`, its `input` is
 * returned as `T`. If the turn ends without that call, this throws.
 */
export async function generateStructuredWithWebSearch<T>(
  systemPrompt: string,
  userPrompt: string,
  submitTool: StructuredTool,
  maxTokens: number = 8000
): Promise<T> {
  const anthropic = getClient();

  const tools: Anthropic.ToolUnion[] = [WEB_SEARCH_TOOL, submitTool];
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools,
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
      tools,
      messages,
    });
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === submitTool.name
  );
  if (!toolUse) {
    throw new Error(
      `Model did not call the ${submitTool.name} tool before ending its turn`
    );
  }
  return toolUse.input as T;
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

export { anthropicApiKey };
