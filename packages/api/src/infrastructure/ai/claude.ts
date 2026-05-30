import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

function getClient(): Anthropic {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey: key });
}

export async function callClaudeVision(
  buffer: Buffer,
  prompt: string,
  mimeType: string = 'image/jpeg',
): Promise<string> {
  const client = getClient();

  const validMediaType = (
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
      ? mimeType
      : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: validMediaType,
              data: buffer.toString('base64'),
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const block = message.content[0];
  if (!block || block.type !== 'text' || !block.text) {
    throw new Error('Claude returned empty response');
  }
  return block.text;
}
