import { ChatService } from './chat.service';
import type { ChatStreamEvent } from './chat.service';
import type { CanonicalSubtitleContext } from './chat-context.service';

describe('ChatService', () => {
  it('serves an initial cache hit without reserving credits', async () => {
    const prisma = {
      chatSession: {
        upsert: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
      chatMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'user-message-1' })
          .mockResolvedValueOnce({ id: 'message-1' }),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          aiCreditsRemaining: 0,
        }),
      },
      aiUsageLog: {
        create: jest.fn(),
      },
    };
    const redis = {
      getJson: jest.fn().mockResolvedValue({
        content: 'Cached explanation',
        tokensUsed: 4,
      }),
    };
    const config = {
      model: 'gpt-4o-mini',
      promptVersion: 'v3',
      provider: 'openai',
    };
    const credits = {
      reserveCredit: jest.fn(),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue({
        mediaId: 'media-1',
        segmentIndex: 3,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        contextHash: 'hash-1',
        current: {
          text: 'Hello there',
          translation: 'Xin chào',
          phonetic: '',
          detected_lang: 'en',
          start: 0,
          end: 1,
          words: [],
          segment_index: 3,
        },
        previous: null,
        next: null,
      }),
    };
    const provider = {
      streamCompletion: jest.fn(),
    };
    const service = new ChatService(
      prisma as never,
      redis as never,
      config as never,
      credits as never,
      contextResolver as never,
      provider as never,
    );

    const events: ChatStreamEvent[] = [];
    for await (const event of service.streamExplain(
      'user-1',
      'media-1',
      { segmentIndex: 3 },
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(credits.reserveCredit).not.toHaveBeenCalled();
    expect(provider.streamCompletion).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        event: 'meta',
        data: {
          sessionId: 'session-1',
          messageId: 'message-1',
          cacheHit: true,
          creditsRemaining: 0,
          model: 'gpt-4o-mini',
          promptVersion: 'v3',
        },
      },
      { event: 'delta', data: { content: 'Cached explanation' } },
      { event: 'done', data: { tokensUsed: 4, finishReason: 'stop' } },
    ]);
  });

  it('builds the initial explain prompt and system prompt in Vietnamese when targetLanguage is vi', () => {
    const service = new ChatService(
      {} as never,
      {} as never,
      {
        model: 'gpt-4o-mini',
        promptVersion: 'v3',
        provider: 'openai',
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const context: CanonicalSubtitleContext = {
      mediaId: 'media-1',
      segmentIndex: 3,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      contextHash: 'hash-1',
      current: {
        text: 'Hello there',
        translation: 'Xin chao',
        phonetic: '',
        detected_lang: 'en',
        start: 0,
        end: 1,
        words: [],
        segment_index: 3,
      },
      previous: null,
      next: null,
    };

    const privateService = service as unknown as {
      buildInitialDisplayMessage: (value: CanonicalSubtitleContext) => string;
      buildSystemPrompt: (
        value: CanonicalSubtitleContext,
        salt: string,
      ) => string;
    };

    expect(privateService.buildInitialDisplayMessage(context)).toBe(
      'Hãy giúp tôi hiểu câu này:\nHello there\nBản dịch hiện tại: Xin chao',
    );
    expect(privateService.buildSystemPrompt(context, 'salt-1')).toContain(
      'phải viết độc quyền bằng tiếng Việt',
    );
  });
});
