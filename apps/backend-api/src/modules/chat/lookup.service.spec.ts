import { HttpException, HttpStatus } from '@nestjs/common';
import type { CanonicalSubtitleContext } from './chat-context.service';
import { LookupPartOfSpeech, type LookupRequestDto } from './dto';
import { LookupService } from './lookup.service';

const baseContext = (
  overrides: Partial<CanonicalSubtitleContext> = {},
): CanonicalSubtitleContext => ({
  mediaId: 'media-1',
  segmentIndex: 2,
  sourceLanguage: 'en',
  targetLanguage: 'vi',
  contextHash: 'hash-1',
  current: {
    text: 'We already know this.',
    translation: 'Chung ta da biet dieu nay.',
    phonetic: '',
    detected_lang: 'en',
    start: 0,
    end: 2,
    words: [
      { word: 'We', start: 0, end: 0.2, confidence: 1, phoneme: 'wee' },
      {
        word: 'already',
        start: 0.21,
        end: 0.6,
        confidence: 1,
        phoneme: 'ol-red-ee',
      },
      { word: 'know', start: 0.61, end: 1, confidence: 1, phoneme: 'noh' },
      { word: 'this', start: 1.01, end: 1.2, confidence: 1, phoneme: 'this' },
      { word: '.', start: 1.21, end: 1.22, confidence: 1, phoneme: null },
    ],
    segment_index: 2,
  },
  previous: null,
  next: null,
  ...overrides,
});

const baseLookupDto: LookupRequestDto = {
  segmentIndex: 2,
  wordText: 'already',
  startWordIndex: 1,
  endWordIndex: 1,
};

describe('LookupService', () => {
  it('serves a paid-user cache hit without consuming the free Redis quota', async () => {
    const config = {
      lookupPromptVersion: 'lookup-v2',
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          currentSubscription: {
            variant: {
              plan: { code: 'pro' },
            },
          },
        }),
      },
      userVocabulary: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const redis = {
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      getJson: jest
        .fn()
        .mockResolvedValueOnce({
          promptVersion: 'lookup-v2',
          data: {
            word: 'already',
            phonetic: 'ol-red-ee',
            partOfSpeech: LookupPartOfSpeech.ADVERB,
            contextualDefinition: 'Sooner than expected in this sentence.',
            exampleSentence: 'We already know this.',
            exampleSentenceTranslation: 'Chung ta da biet dieu nay.',
          },
        })
        .mockResolvedValueOnce(null),
      setJson: jest.fn(),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue(baseContext()),
    };
    const provider = {
      createLookupCompletion: jest.fn(),
    };
    const service = new LookupService(
      prisma as never,
      redis as never,
      contextResolver as never,
      provider as never,
      config as never,
    );

    const response = await service.lookup('user-1', 'media-1', baseLookupDto);

    expect(redis.incr).not.toHaveBeenCalled();
    expect(provider.createLookupCompletion).not.toHaveBeenCalled();
    expect(response.meta.cacheHit).toBe(true);
    expect(response.meta.alreadySaved).toBe(false);
    expect(response.meta.quota).toEqual({
      tier: 'paid',
      dailyLimit: null,
      remainingToday: null,
      resetsInSeconds: null,
    });
    expect(response.meta.saveToken).toEqual(expect.any(String));
    expect(redis.setJson).toHaveBeenCalledWith(
      expect.stringMatching(/^lookup-save:/),
      expect.objectContaining({
        userId: 'user-1',
        mediaId: 'media-1',
        canonicalWordText: 'already',
      }),
      604800,
    );
  });

  it('enforces the free lookup limit with a rolling Redis counter', async () => {
    const config = {
      lookupPromptVersion: 'lookup-v2',
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          currentSubscription: null,
        }),
      },
      userVocabulary: {
        findUnique: jest.fn(),
      },
    };
    const redis = {
      incr: jest.fn().mockResolvedValue(21),
      expire: jest.fn(),
      ttl: jest.fn().mockResolvedValue(123),
      getJson: jest.fn(),
      setJson: jest.fn(),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue(baseContext()),
    };
    const provider = {
      createLookupCompletion: jest.fn(),
    };
    const service = new LookupService(
      prisma as never,
      redis as never,
      contextResolver as never,
      provider as never,
      config as never,
    );

    await expect(
      service.lookup('user-1', 'media-1', baseLookupDto),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    } as Partial<HttpException>);

    expect(redis.incr).toHaveBeenCalledWith('rate_limit:lookup:user-1');
    expect(provider.createLookupCompletion).not.toHaveBeenCalled();
    expect(prisma.userVocabulary.findUnique).not.toHaveBeenCalled();
  });

  it('hydrates cache and save-token snapshots on a free-user miss', async () => {
    const config = {
      lookupPromptVersion: 'lookup-v2',
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          currentSubscription: null,
        }),
      },
      userVocabulary: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const redis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn(),
      ttl: jest.fn().mockResolvedValue(86400),
      getJson: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      setJson: jest.fn(),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue(
        baseContext({
          sourceLanguage: 'zh',
          current: {
            text: '我们知道',
            translation: 'Chung ta biet',
            phonetic: '',
            detected_lang: 'zh',
            start: 0,
            end: 1,
            words: [
              { word: '我', start: 0, end: 0.1, confidence: 1, phoneme: 'wo' },
              {
                word: '们',
                start: 0.11,
                end: 0.2,
                confidence: 1,
                phoneme: 'men',
              },
            ],
            segment_index: 2,
          },
        }),
      ),
    };
    const provider = {
      createLookupCompletion: jest.fn().mockResolvedValue({
        selectedText: '我们',
        partOfSpeech: LookupPartOfSpeech.PRONOUN,
        contextualDefinition: 'It refers to the speaker and others.',
      }),
    };
    const service = new LookupService(
      prisma as never,
      redis as never,
      contextResolver as never,
      provider as never,
      config as never,
    );

    const response = await service.lookup('user-1', 'media-1', {
      ...baseLookupDto,
      wordText: '我们',
      startWordIndex: 0,
      endWordIndex: 1,
    });

    expect(redis.expire).toHaveBeenCalledWith(
      'rate_limit:lookup:user-1',
      86400,
    );
    expect(provider.createLookupCompletion).toHaveBeenCalledTimes(1);
    const lookupCalls = provider.createLookupCompletion.mock.calls as Array<
      [Array<{ role: string; content: string }>, AbortSignal]
    >;
    const lookupMessages = lookupCalls[0]?.[0];
    expect(lookupMessages).toBeDefined();
    expect(lookupMessages?.[0]?.content).toContain(
      'The contextualDefinition must explain what the selected text is doing in this exact sentence.',
    );
    expect(lookupMessages?.[1]?.content).toContain(
      'Explain the selected text specifically in relation to this sentence, not as an isolated dictionary entry.',
    );
    expect(redis.setJson).toHaveBeenNthCalledWith(
      1,
      'lookup:media-1:2:我们',
      {
        promptVersion: 'lookup-v2',
        data: {
          word: '我们',
          phonetic: 'women',
          partOfSpeech: LookupPartOfSpeech.PRONOUN,
          contextualDefinition: 'It refers to the speaker and others.',
          exampleSentence: '我们知道',
          exampleSentenceTranslation: 'Chung ta biet',
        },
      },
      604800,
    );
    expect(redis.setJson).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^lookup-save:/),
      expect.objectContaining({
        canonicalWordText: '我们',
        normalizedWord: '我们',
        sourceLanguage: 'zh',
      }),
      604800,
    );
    expect(response.meta.quota.remainingToday).toBe(19);
    expect(response.data.word).toBe('我们');
  });

  it('rejects mismatched client word text before quota is consumed', async () => {
    const config = {
      lookupPromptVersion: 'lookup-v2',
    };
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      userVocabulary: {
        findUnique: jest.fn(),
      },
    };
    const redis = {
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      getJson: jest.fn(),
      setJson: jest.fn(),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue(baseContext()),
    };
    const provider = {
      createLookupCompletion: jest.fn(),
    };
    const service = new LookupService(
      prisma as never,
      redis as never,
      contextResolver as never,
      provider as never,
      config as never,
    );

    await expect(
      service.lookup('user-1', 'media-1', {
        ...baseLookupDto,
        wordText: 'later',
      }),
    ).rejects.toThrow(
      'Selected word does not match canonical subtitle tokens.',
    );

    expect(redis.incr).not.toHaveBeenCalled();
    expect(provider.createLookupCompletion).not.toHaveBeenCalled();
  });

  it('ignores legacy lookup cache entries when the prompt version changes', async () => {
    const config = {
      lookupPromptVersion: 'lookup-v2',
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          currentSubscription: {
            variant: {
              plan: { code: 'pro' },
            },
          },
        }),
      },
      userVocabulary: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const redis = {
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      getJson: jest
        .fn()
        .mockResolvedValueOnce({
          word: 'already',
          phonetic: 'ol-red-ee',
          partOfSpeech: LookupPartOfSpeech.ADVERB,
          contextualDefinition: 'Old cache entry.',
          exampleSentence: 'We already know this.',
          exampleSentenceTranslation: 'Chung ta da biet dieu nay.',
        })
        .mockResolvedValueOnce(null),
      setJson: jest.fn(),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue(baseContext()),
    };
    const provider = {
      createLookupCompletion: jest.fn().mockResolvedValue({
        selectedText: 'already',
        partOfSpeech: LookupPartOfSpeech.ADVERB,
        contextualDefinition:
          'In this sentence, it marks the action as having happened sooner than expected.',
      }),
    };
    const service = new LookupService(
      prisma as never,
      redis as never,
      contextResolver as never,
      provider as never,
      config as never,
    );

    const response = await service.lookup('user-1', 'media-1', baseLookupDto);

    expect(provider.createLookupCompletion).toHaveBeenCalledTimes(1);
    expect(response.meta.cacheHit).toBe(false);
    expect(response.data.contextualDefinition).toContain(
      'sooner than expected',
    );
  });

  it('persists a saved lookup snapshot using the Redis save token', async () => {
    const config = {
      lookupPromptVersion: 'lookup-v2',
    };
    const prisma = {
      userVocabulary: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'saved-1',
          vocabularyId: 'vocab-1',
          vocabulary: {
            word: 'already',
            sourceLanguage: 'en',
          },
          phoneticSnapshot: 'ol-red-ee',
          partOfSpeech: LookupPartOfSpeech.ADVERB,
          contextualDefinition: 'Sooner than expected in this sentence.',
          sourceSentence: 'We already know this.',
          sourceSentenceTranslation: 'Chung ta da biet dieu nay.',
          mediaItemId: 'media-1',
          segmentIndex: 2,
          startWordIndex: 1,
          endWordIndex: 1,
          createdAt: new Date('2026-05-25T12:00:00.000Z'),
        }),
      },
      vocabulary: {
        upsert: jest.fn().mockResolvedValue({
          id: 'vocab-1',
        }),
      },
    };
    const redis = {
      getJson: jest.fn().mockResolvedValue({
        userId: 'user-1',
        mediaId: 'media-1',
        segmentIndex: 2,
        startWordIndex: 1,
        endWordIndex: 1,
        canonicalWordText: 'already',
        normalizedWord: 'already',
        sourceLanguage: 'en',
        data: {
          word: 'already',
          phonetic: 'ol-red-ee',
          partOfSpeech: LookupPartOfSpeech.ADVERB,
          contextualDefinition: 'Sooner than expected in this sentence.',
          exampleSentence: 'We already know this.',
          exampleSentenceTranslation: 'Chung ta da biet dieu nay.',
        },
      }),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue(baseContext()),
    };
    const provider = {
      createLookupCompletion: jest.fn(),
    };
    const service = new LookupService(
      prisma as never,
      redis as never,
      contextResolver as never,
      provider as never,
      config as never,
    );

    const response = await service.saveWord('user-1', 'media-1', {
      ...baseLookupDto,
      saveToken: '1a87b8f0-7a49-4d62-af0f-54f6d063c8e6',
    });

    expect(prisma.vocabulary.upsert).toHaveBeenCalledWith({
      where: {
        normalizedWord_sourceLanguage: {
          normalizedWord: 'already',
          sourceLanguage: 'en',
        },
      },
      update: {
        word: 'already',
        phonetic: 'ol-red-ee',
      },
      create: {
        word: 'already',
        normalizedWord: 'already',
        sourceLanguage: 'en',
        phonetic: 'ol-red-ee',
      },
    });
    expect(prisma.userVocabulary.create).toHaveBeenCalled();
    expect(response).toEqual({
      created: true,
      item: {
        id: 'saved-1',
        vocabularyId: 'vocab-1',
        word: 'already',
        sourceLanguage: 'en',
        phonetic: 'ol-red-ee',
        partOfSpeech: LookupPartOfSpeech.ADVERB,
        contextualDefinition: 'Sooner than expected in this sentence.',
        exampleSentence: 'We already know this.',
        exampleSentenceTranslation: 'Chung ta da biet dieu nay.',
        mediaItemId: 'media-1',
        segmentIndex: 2,
        startWordIndex: 1,
        endWordIndex: 1,
        createdAt: '2026-05-25T12:00:00.000Z',
      },
    });
  });

  it('returns the existing saved word when a concurrent unique-key race occurs', async () => {
    const config = {
      lookupPromptVersion: 'lookup-v2',
    };
    const prisma = {
      userVocabulary: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'saved-1',
            vocabularyId: 'vocab-1',
            vocabulary: {
              word: 'already',
              sourceLanguage: 'en',
            },
            phoneticSnapshot: 'ol-red-ee',
            partOfSpeech: LookupPartOfSpeech.ADVERB,
            contextualDefinition: 'Sooner than expected in this sentence.',
            sourceSentence: 'We already know this.',
            sourceSentenceTranslation: 'Chung ta da biet dieu nay.',
            mediaItemId: 'media-1',
            segmentIndex: 2,
            startWordIndex: 1,
            endWordIndex: 1,
            createdAt: new Date('2026-05-25T12:00:00.000Z'),
          }),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
      vocabulary: {
        upsert: jest.fn().mockResolvedValue({
          id: 'vocab-1',
        }),
      },
    };
    const redis = {
      getJson: jest.fn().mockResolvedValue({
        userId: 'user-1',
        mediaId: 'media-1',
        segmentIndex: 2,
        startWordIndex: 1,
        endWordIndex: 1,
        canonicalWordText: 'already',
        normalizedWord: 'already',
        sourceLanguage: 'en',
        data: {
          word: 'already',
          phonetic: 'ol-red-ee',
          partOfSpeech: LookupPartOfSpeech.ADVERB,
          contextualDefinition: 'Sooner than expected in this sentence.',
          exampleSentence: 'We already know this.',
          exampleSentenceTranslation: 'Chung ta da biet dieu nay.',
        },
      }),
    };
    const contextResolver = {
      resolveCanonicalContext: jest.fn().mockResolvedValue(baseContext()),
    };
    const provider = {
      createLookupCompletion: jest.fn(),
    };
    const service = new LookupService(
      prisma as never,
      redis as never,
      contextResolver as never,
      provider as never,
      config as never,
    );

    const response = await service.saveWord('user-1', 'media-1', {
      ...baseLookupDto,
      saveToken: '1a87b8f0-7a49-4d62-af0f-54f6d063c8e6',
    });

    expect(prisma.userVocabulary.create).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      created: false,
      item: {
        id: 'saved-1',
        vocabularyId: 'vocab-1',
        word: 'already',
        sourceLanguage: 'en',
        phonetic: 'ol-red-ee',
        partOfSpeech: LookupPartOfSpeech.ADVERB,
        contextualDefinition: 'Sooner than expected in this sentence.',
        exampleSentence: 'We already know this.',
        exampleSentenceTranslation: 'Chung ta da biet dieu nay.',
        mediaItemId: 'media-1',
        segmentIndex: 2,
        startWordIndex: 1,
        endWordIndex: 1,
        createdAt: '2026-05-25T12:00:00.000Z',
      },
    });
  });
});
