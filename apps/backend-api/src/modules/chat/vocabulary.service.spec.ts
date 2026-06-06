import { VocabularyService } from './vocabulary.service';

describe('VocabularyService', () => {
  it('groups contexts by canonical vocabulary and keeps newest-first ordering', async () => {
    const prisma = {
      userVocabulary: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'save-3',
            mediaItemId: 'media-2',
            segmentIndex: 5,
            startWordIndex: 1,
            endWordIndex: 1,
            selectedTextSnapshot: '已经',
            phoneticSnapshot: 'yi jing',
            partOfSpeech: 'adverb',
            contextualDefinition: 'Marks that something already happened.',
            sourceSentence: '我们已经知道了。',
            sourceSentenceTranslation: 'Chung ta da biet roi.',
            createdAt: new Date('2026-05-27T10:00:00.000Z'),
            vocabulary: {
              id: 'vocab-1',
              word: '已经',
              sourceLanguage: 'zh',
              phonetic: 'yi jing',
            },
            mediaItem: {
              id: 'media-2',
              title: 'Episode 2',
              originType: 'LOCAL',
              youtubeVideoId: null,
              hasThumbnail: true,
              deletedAt: null,
            },
          },
          {
            id: 'save-2',
            mediaItemId: 'media-1',
            segmentIndex: 3,
            startWordIndex: 0,
            endWordIndex: 0,
            selectedTextSnapshot: '已经',
            phoneticSnapshot: 'yi jing',
            partOfSpeech: 'adverb',
            contextualDefinition:
              'Indicates an action happened sooner than expected.',
            sourceSentence: '他已经来了。',
            sourceSentenceTranslation: 'Anh ay da den roi.',
            createdAt: new Date('2026-05-26T10:00:00.000Z'),
            vocabulary: {
              id: 'vocab-1',
              word: '已经',
              sourceLanguage: 'zh',
              phonetic: 'yi jing',
            },
            mediaItem: {
              id: 'media-1',
              title: 'Episode 1',
              originType: 'YOUTUBE',
              youtubeVideoId: 'abc123',
              hasThumbnail: false,
              deletedAt: null,
            },
          },
          {
            id: 'save-1',
            mediaItemId: 'media-3',
            segmentIndex: 1,
            startWordIndex: 2,
            endWordIndex: 2,
            selectedTextSnapshot: 'already',
            phoneticSnapshot: 'ol-red-ee',
            partOfSpeech: 'adverb',
            contextualDefinition: 'Signals the event happened before now.',
            sourceSentence: 'We already know this.',
            sourceSentenceTranslation: 'Chung ta da biet dieu nay.',
            createdAt: new Date('2026-05-25T10:00:00.000Z'),
            vocabulary: {
              id: 'vocab-2',
              word: 'already',
              sourceLanguage: 'en',
              phonetic: 'ol-red-ee',
            },
            mediaItem: {
              id: 'media-3',
              title: 'English Clip',
              originType: 'LOCAL',
              youtubeVideoId: null,
              hasThumbnail: false,
              deletedAt: null,
            },
          },
        ]),
      },
    };
    const minioService = {
      generatePresignedGetUrl: jest
        .fn()
        .mockResolvedValue('https://minio.example/media-2/thumbnail.jpg'),
    };
    const service = new VocabularyService(
      prisma as never,
      minioService as never,
    );

    const response = await service.listWordBank('user-1');

    expect(response.meta).toEqual({
      totalGroups: 2,
      totalContexts: 3,
    });
    expect(response.data).toHaveLength(2);
    expect(response.data[0]).toMatchObject({
      vocabularyId: 'vocab-1',
      word: '已经',
      sourceLanguage: 'zh',
      phonetic: 'yi jing',
      contextCount: 2,
      latestSavedAt: '2026-05-27T10:00:00.000Z',
    });
    expect(response.data[0]?.contexts.map((item) => item.id)).toEqual([
      'save-3',
      'save-2',
    ]);
    expect(response.data[0]?.contexts[0]).toMatchObject({
      mediaItemId: 'media-2',
      mediaThumbnailUrl: 'https://minio.example/media-2/thumbnail.jpg',
      mediaOriginType: 'LOCAL',
    });
    expect(response.data[0]?.contexts[1]).toMatchObject({
      mediaItemId: 'media-1',
      mediaThumbnailUrl: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
      mediaOriginType: 'YOUTUBE',
    });
    expect(minioService.generatePresignedGetUrl).toHaveBeenCalledTimes(1);
    expect(minioService.generatePresignedGetUrl).toHaveBeenCalledWith(
      'media-2/thumbnail.jpg',
    );
  });

  it('keeps soft-deleted media contexts visible but unavailable', async () => {
    const prisma = {
      userVocabulary: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'save-1',
            mediaItemId: 'media-9',
            segmentIndex: 4,
            startWordIndex: 0,
            endWordIndex: 0,
            selectedTextSnapshot: '点',
            phoneticSnapshot: 'dian',
            partOfSpeech: 'classifier',
            contextualDefinition: 'Classifier in this saved sentence.',
            sourceSentence: '一点都不难。',
            sourceSentenceTranslation: 'Khong he kho.',
            createdAt: new Date('2026-05-28T10:00:00.000Z'),
            vocabulary: {
              id: 'vocab-9',
              word: '点',
              sourceLanguage: 'zh',
              phonetic: null,
            },
            mediaItem: {
              id: 'media-9',
              title: 'Archived Lesson',
              originType: 'LOCAL',
              youtubeVideoId: null,
              hasThumbnail: true,
              deletedAt: new Date('2026-05-29T10:00:00.000Z'),
            },
          },
        ]),
      },
    };
    const minioService = {
      generatePresignedGetUrl: jest.fn(),
    };
    const service = new VocabularyService(
      prisma as never,
      minioService as never,
    );

    const response = await service.listWordBank('user-1');

    expect(response.data[0]?.phonetic).toBe('dian');
    expect(response.data[0]?.contexts[0]).toMatchObject({
      mediaAvailable: false,
      mediaThumbnailUrl: null,
      mediaTitle: 'Archived Lesson',
    });
    expect(minioService.generatePresignedGetUrl).not.toHaveBeenCalled();
  });

  it('returns an empty payload when the user has no saved vocabulary', async () => {
    const prisma = {
      userVocabulary: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const minioService = {
      generatePresignedGetUrl: jest.fn(),
    };
    const service = new VocabularyService(
      prisma as never,
      minioService as never,
    );

    await expect(service.listWordBank('user-1')).resolves.toEqual({
      data: [],
      meta: {
        totalGroups: 0,
        totalContexts: 0,
      },
    });
  });
});
