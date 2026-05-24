import { readFileSync } from 'fs';
import { join } from 'path';
import { APIError, RateLimitError } from 'openai';
import { ChatProviderService } from './chat-provider.service';
import { ChatProviderError } from './chat-provider.errors';
import { ExplainErrorCode } from './dto';
import type { ChatCompletionChunk } from './chat-provider.service';

const createConfig = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    apiKey: 'test-key',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxOutputTokens: 800,
    timeoutMs: 30_000,
    ...overrides,
  }) as never;

async function* streamChunks() {
  await Promise.resolve();
  yield {
    choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
  };
  yield {
    choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }],
  };
}

describe('ChatProviderService', () => {
  it('streams typed SDK chunks without exposing provider frames', async () => {
    const create = jest.fn().mockResolvedValue(streamChunks());
    const openai = {
      chat: { completions: { create } },
    };
    const service = new ChatProviderService(createConfig(), openai as never);

    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of service.streamCompletion(
      [{ role: 'user', content: 'Explain this' }],
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        stream: true,
        max_tokens: 800,
      }),
      expect.objectContaining({
        timeout: 30_000,
        maxRetries: 0,
      }),
    );
    expect(chunks).toEqual([
      { content: 'Hello', finishReason: undefined },
      { content: ' world', finishReason: 'stop' },
    ]);
  });

  it('maps SDK rate limits to the canonical Kapter error code', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(
        new RateLimitError(429, {}, 'rate limited', new Headers()),
      );
    const service = new ChatProviderService(createConfig(), {
      chat: { completions: { create } },
    } as never);

    await expect(
      async () =>
        await service
          .streamCompletion(
            [{ role: 'user', content: 'Explain this' }],
            new AbortController().signal,
          )
          .next(),
    ).rejects.toMatchObject<Partial<ChatProviderError>>({
      code: ExplainErrorCode.RATE_LIMITED,
    });
  });

  it('masks generic SDK client errors behind canonical Kapter errors', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new APIError(400, {}, 'bad request', new Headers()));
    const service = new ChatProviderService(createConfig(), {
      chat: { completions: { create } },
    } as never);

    await expect(
      async () =>
        await service
          .streamCompletion(
            [{ role: 'user', content: 'Explain this' }],
            new AbortController().signal,
          )
          .next(),
    ).rejects.toMatchObject<Partial<ChatProviderError>>({
      code: ExplainErrorCode.LLM_ERROR,
      message: 'AI assistant could not complete this request.',
    });
  });

  it('does not reintroduce manual provider SSE parsing', () => {
    const source = readFileSync(join(__dirname, 'chat-provider.service.ts'), {
      encoding: 'utf8',
    });

    expect(source).not.toContain('getReader');
    expect(source).not.toContain('TextDecoder');
    expect(source).not.toContain('data:');
    expect(source).not.toContain('[DONE]');
  });
});
