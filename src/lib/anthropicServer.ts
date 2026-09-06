import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

/** Strips ```json fences (or any code fence) a model sometimes wraps JSON in, then parses. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1] : trimmed;
  return JSON.parse(body);
}

interface CallOptions {
  prompt: string;
  imageBase64?: string;
  imageMediaType?: string;
  maxTokens?: number;
}

export async function callClaudeForJson({ prompt, imageBase64, imageMediaType, maxTokens = 2048 }: CallOptions): Promise<unknown> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    const err = new Error('not_configured');
    (err as Error & { code: string }).code = 'not_configured';
    throw err;
  }
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (imageBase64 && imageMediaType) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 },
    });
  }
  content.push({ type: 'text', text: prompt });

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  const text = textBlock && 'text' in textBlock ? textBlock.text : '';
  if (!text.trim()) {
    const err = new Error('empty_completion');
    (err as Error & { code: string }).code = 'empty_completion';
    throw err;
  }
  try {
    return parseJsonLoose(text);
  } catch {
    const err = new Error('invalid_json');
    (err as Error & { code: string }).code = 'invalid_json';
    throw err;
  }
}
