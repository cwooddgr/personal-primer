import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

export const MODEL = 'claude-opus-5-5';

// Opus 5.5 always thinks; effort is the only control, and it defaults to
// 'medium'. Structured generation keeps that default, set explicitly. The
// chat loops run at 'low' because they were tuned on Opus 4.7 with thinking
// off and a user is waiting on the reply.
const STRUCTURED_EFFORT = 'medium' as const;
const CHAT_EFFORT = 'low' as const;

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
 * Structured outputs require `additionalProperties: false` on every object.
 * The tool schemas predate that, so add it here rather than in each caller.
 */
function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = strictSchema(v);
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

/**
 * Generate structured output constrained to the tool's input schema. (Forced
 * `tool_choice` was the old way to do this; Opus 5.5 rejects it with a 400.)
 * The parsed JSON is returned as `T`.
 */
export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  tool: StructuredTool,
  maxTokens: number = 16000
): Promise<T> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    output_config: {
      effort: STRUCTURED_EFFORT,
      format: {
        type: 'json_schema',
        schema: strictSchema(tool.input_schema) as Record<string, unknown>,
      },
    },
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (response.stop_reason !== 'end_turn') {
    throw new Error(
      `${tool.name}: generation stopped early (${response.stop_reason})`
    );
  }
  return JSON.parse(extractText(response.content)) as T;
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
  maxTokens: number = 16000
): Promise<T> {
  const anthropic = getClient();

  const tools: Anthropic.ToolUnion[] = [
    WEB_SEARCH_TOOL,
    {
      ...submitTool,
      input_schema: strictSchema(submitTool.input_schema) as Anthropic.Tool.InputSchema,
      strict: true,
    },
  ];
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools,
    messages,
    output_config: { effort: STRUCTURED_EFFORT },
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
      output_config: { effort: STRUCTURED_EFFORT },
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
  maxTokens: number = 8000
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
      output_config: { effort: CHAT_EFFORT },
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
