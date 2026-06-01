import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import {
  ChatContextService,
  CanonicalSubtitleContext,
  SubtitleWord,
} from './chat-context.service';
import {
  ChatCompletionMessage,
  ChatProviderService,
} from './chat-provider.service';
import { ChatConfigService } from './chat-config.service';
import { ChatProviderError } from './chat-provider.errors';
import {
  LookupDataDto,
  LookupErrorCode,
  LookupPartOfSpeech,
  LookupRequestDto,
  LookupResponseDto,
  LookupQuotaMetaDto,
  SaveLookupWordDto,
  SaveLookupWordResponseDto,
} from './dto';

interface LookupCacheEntry {
  promptVersion: string;
  data: LookupDataDto;
}

interface LookupSaveTokenEntry {
  userId: string;
  mediaId: string;
  segmentIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  canonicalWordText: string;
  normalizedWord: string;
  sourceLanguage: string;
  data: LookupDataDto;
}

interface ResolvedSelection {
  context: CanonicalSubtitleContext;
  selectedWords: SubtitleWord[];
  canonicalWordText: string;
  normalizedWord: string;
  phonetic: string;
  sourceLanguage: string;
}

interface SavedUserVocabularyRow {
  id: string;
  vocabularyId: string;
  vocabulary: { word: string; sourceLanguage: string };
  phoneticSnapshot: string;
  partOfSpeech: string;
  contextualDefinition: string;
  sourceSentence: string;
  sourceSentenceTranslation: string;
  mediaItemId: string;
  segmentIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  createdAt: Date;
}

const FREE_LOOKUP_LIMIT = 20;
const LOOKUP_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOOKUP_RATE_LIMIT_TTL_SECONDS = 24 * 60 * 60;
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;
const PUNCTUATION_ONLY_PATTERN = /^[^\p{L}\p{N}]+$/u;

@Injectable()
export class LookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly contextResolver: ChatContextService,
    private readonly provider: ChatProviderService,
    private readonly config: ChatConfigService,
  ) {}

  async lookup(
    userId: string,
    mediaId: string,
    dto: LookupRequestDto,
  ): Promise<LookupResponseDto> {
    const selection = await this.resolveSelection(userId, mediaId, dto);
    const quota = await this.consumeLookupQuota(userId);
    const cacheKey = this.buildCacheKey(
      mediaId,
      dto.segmentIndex,
      selection.canonicalWordText,
    );
    const alreadySaved = await this.isSelectionSaved(userId, mediaId, dto);
    const cached = await this.readLookupCache(cacheKey);

    const data =
      cached ??
      (await this.createLookupData(selection, new AbortController().signal));

    if (!cached) {
      await this.redis.setJson<LookupCacheEntry>(
        cacheKey,
        {
          promptVersion: this.config.lookupPromptVersion,
          data,
        },
        LOOKUP_CACHE_TTL_SECONDS,
      );
    }

    const saveToken = await this.createSaveToken(
      userId,
      mediaId,
      dto,
      selection,
      data,
    );

    return {
      data,
      meta: {
        cacheHit: Boolean(cached),
        alreadySaved,
        saveToken,
        quota,
      },
    };
  }

  async saveWord(
    userId: string,
    mediaId: string,
    dto: SaveLookupWordDto,
  ): Promise<SaveLookupWordResponseDto> {
    const selection = await this.resolveSelection(userId, mediaId, dto);
    const saveToken = await this.redis.getJson<LookupSaveTokenEntry>(
      this.buildSaveTokenKey(dto.saveToken),
    );

    if (!saveToken) {
      throw new BadRequestException({
        code: LookupErrorCode.INVALID_SAVE_TOKEN,
        message: 'Lookup snapshot token is missing or has expired.',
      });
    }

    if (
      saveToken.userId !== userId ||
      saveToken.mediaId !== mediaId ||
      saveToken.segmentIndex !== dto.segmentIndex ||
      saveToken.startWordIndex !== dto.startWordIndex ||
      saveToken.endWordIndex !== dto.endWordIndex ||
      saveToken.canonicalWordText !== selection.canonicalWordText ||
      saveToken.normalizedWord !== selection.normalizedWord ||
      saveToken.sourceLanguage !== selection.sourceLanguage
    ) {
      throw new BadRequestException({
        code: LookupErrorCode.INVALID_SAVE_TOKEN,
        message: 'Lookup snapshot token does not match this word selection.',
      });
    }

    const existing = await this.prisma.userVocabulary.findUnique({
      where: {
        userId_mediaItemId_segmentIndex_startWordIndex_endWordIndex: {
          userId,
          mediaItemId: mediaId,
          segmentIndex: dto.segmentIndex,
          startWordIndex: dto.startWordIndex,
          endWordIndex: dto.endWordIndex,
        },
      },
      include: {
        vocabulary: true,
      },
    });

    if (existing) {
      return {
        created: false,
        item: this.mapSavedItem(existing),
      };
    }

    const vocabulary = await this.prisma.vocabulary.upsert({
      where: {
        normalizedWord_sourceLanguage: {
          normalizedWord: selection.normalizedWord,
          sourceLanguage: selection.sourceLanguage,
        },
      },
      update:
        saveToken.data.phonetic.trim().length > 0
          ? {
              word: selection.canonicalWordText,
              phonetic: saveToken.data.phonetic,
            }
          : {
              word: selection.canonicalWordText,
            },
      create: {
        word: selection.canonicalWordText,
        normalizedWord: selection.normalizedWord,
        sourceLanguage: selection.sourceLanguage,
        phonetic: saveToken.data.phonetic || null,
      },
    });

    let created: SavedUserVocabularyRow;
    try {
      created = await this.prisma.userVocabulary.create({
        data: {
          userId,
          vocabularyId: vocabulary.id,
          mediaItemId: mediaId,
          segmentIndex: dto.segmentIndex,
          startWordIndex: dto.startWordIndex,
          endWordIndex: dto.endWordIndex,
          selectedTextSnapshot: selection.canonicalWordText,
          phoneticSnapshot: saveToken.data.phonetic,
          partOfSpeech: saveToken.data.partOfSpeech,
          contextualDefinition: saveToken.data.contextualDefinition,
          sourceSentence: saveToken.data.exampleSentence,
          sourceSentenceTranslation: saveToken.data.exampleSentenceTranslation,
        },
        include: {
          vocabulary: true,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentExisting = await this.prisma.userVocabulary.findUnique({
        where: {
          userId_mediaItemId_segmentIndex_startWordIndex_endWordIndex: {
            userId,
            mediaItemId: mediaId,
            segmentIndex: dto.segmentIndex,
            startWordIndex: dto.startWordIndex,
            endWordIndex: dto.endWordIndex,
          },
        },
        include: {
          vocabulary: true,
        },
      });

      if (!concurrentExisting) {
        throw error;
      }

      return {
        created: false,
        item: this.mapSavedItem(concurrentExisting),
      };
    }

    return {
      created: true,
      item: this.mapSavedItem(created),
    };
  }

  private async resolveSelection(
    userId: string,
    mediaId: string,
    dto: Pick<
      LookupRequestDto,
      'segmentIndex' | 'wordText' | 'startWordIndex' | 'endWordIndex'
    >,
  ): Promise<ResolvedSelection> {
    if (dto.endWordIndex < dto.startWordIndex) {
      throw new BadRequestException({
        code: LookupErrorCode.INVALID_WORD_SELECTION,
        message: 'Word selection indices are invalid.',
      });
    }

    let context: CanonicalSubtitleContext;
    try {
      context = await this.contextResolver.resolveCanonicalContext(
        userId,
        mediaId,
        dto.segmentIndex,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException({
          code: LookupErrorCode.MEDIA_NOT_FOUND,
          message: 'Media item not found.',
        });
      }

      if (
        error instanceof BadRequestException &&
        this.readExceptionMessage(error).includes(
          'Subtitle context is not available yet',
        )
      ) {
        throw new ConflictException({
          code: LookupErrorCode.SUBTITLE_CONTEXT_UNAVAILABLE,
          message: 'Subtitle context is not available yet.',
        });
      }

      throw error;
    }

    const words = Array.isArray(context.current.words)
      ? context.current.words
      : [];
    if (words.length === 0) {
      throw new BadRequestException({
        code: LookupErrorCode.INVALID_WORD_SELECTION,
        message: 'This subtitle segment does not expose word-level tokens.',
      });
    }

    if (dto.startWordIndex < 0 || dto.endWordIndex >= words.length) {
      throw new BadRequestException({
        code: LookupErrorCode.INVALID_WORD_SELECTION,
        message: 'Word selection indices are out of range.',
      });
    }

    const selectedWords = words.slice(dto.startWordIndex, dto.endWordIndex + 1);
    const isCjk = this.isCjkSelection(context, selectedWords);
    const canonicalWordText = this.joinWordValues(
      selectedWords.map((word) => word.word),
      isCjk,
    );
    const normalizedWord = this.normalizeWord(canonicalWordText);

    if (
      !canonicalWordText ||
      !normalizedWord ||
      PUNCTUATION_ONLY_PATTERN.test(canonicalWordText)
    ) {
      throw new BadRequestException({
        code: LookupErrorCode.INVALID_WORD_SELECTION,
        message: 'Please select a valid word or phrase.',
      });
    }

    const providedWord = this.normalizeWord(dto.wordText);
    if (providedWord !== normalizedWord) {
      throw new BadRequestException({
        code: LookupErrorCode.INVALID_WORD_SELECTION,
        message: 'Selected word does not match canonical subtitle tokens.',
      });
    }

    return {
      context,
      selectedWords,
      canonicalWordText,
      normalizedWord,
      phonetic: this.joinWordValues(
        selectedWords
          .map((word) => word.phoneme?.trim() ?? '')
          .filter((value) => value.length > 0),
        isCjk,
      ),
      sourceLanguage: this.normalizeLanguage(
        context.current.detected_lang || context.sourceLanguage,
      ),
    };
  }

  private async consumeLookupQuota(
    userId: string,
  ): Promise<LookupQuotaMetaDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentSubscription: {
          select: {
            variant: {
              select: {
                plan: {
                  select: { code: true },
                },
              },
            },
          },
        },
      },
    });

    const planCode =
      user?.currentSubscription?.variant?.plan?.code?.toLowerCase();
    if (planCode && planCode !== 'free') {
      return {
        tier: 'paid',
        dailyLimit: null,
        remainingToday: null,
        resetsInSeconds: null,
      };
    }

    const key = this.buildRateLimitKey(userId);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, LOOKUP_RATE_LIMIT_TTL_SECONDS);
    } else {
      const ttl = await this.redis.ttl(key);
      if (ttl < 0) {
        await this.redis.expire(key, LOOKUP_RATE_LIMIT_TTL_SECONDS);
      }
    }

    const ttl = await this.redis.ttl(key);
    const quota: LookupQuotaMetaDto = {
      tier: 'free',
      dailyLimit: FREE_LOOKUP_LIMIT,
      remainingToday: Math.max(0, FREE_LOOKUP_LIMIT - count),
      resetsInSeconds: Math.max(0, ttl),
    };

    if (count > FREE_LOOKUP_LIMIT) {
      throw new HttpException(
        {
          code: LookupErrorCode.LOOKUP_LIMIT_REACHED,
          message: 'Daily vocabulary lookup limit reached for the free plan.',
          quota,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return quota;
  }

  private async createLookupData(
    selection: ResolvedSelection,
    signal: AbortSignal,
  ): Promise<LookupDataDto> {
    try {
      const response = await this.provider.createLookupCompletion(
        this.buildLookupMessages(selection),
        signal,
      );

      if (
        this.normalizeWord(response.selectedText) !== selection.normalizedWord
      ) {
        throw new BadGatewayException({
          code: LookupErrorCode.LLM_ERROR,
          message: 'Vocabulary lookup returned an unexpected word selection.',
        });
      }

      return {
        word: selection.canonicalWordText,
        phonetic: selection.phonetic,
        partOfSpeech: response.partOfSpeech,
        contextualDefinition: response.contextualDefinition.trim(),
        exampleSentence: selection.context.current.text,
        exampleSentenceTranslation:
          selection.context.current.translation?.trim() ?? '',
      };
    } catch (error) {
      if (error instanceof ChatProviderError) {
        throw this.mapProviderError(error);
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new ServiceUnavailableException({
        code: LookupErrorCode.LLM_UNAVAILABLE,
        message: 'Vocabulary lookup is temporarily unavailable.',
      });
    }
  }

  private buildLookupMessages(
    selection: ResolvedSelection,
  ): ChatCompletionMessage[] {
    const currentTranslation =
      selection.context.current.translation?.trim() || '(none)';
    const previousText = selection.context.previous?.text?.trim() || '(none)';
    const nextText = selection.context.next?.text?.trim() || '(none)';
    const targetLanguage = selection.context.targetLanguage || 'en';
    const surroundingTokens = selection.context.current.words
      .map((word, index) => `${index + 1}. ${word.word}`)
      .join(' | ');
    const selectedIndexStart =
      selection.context.current.words.findIndex(
        (word) => word === selection.selectedWords[0],
      ) + 1;
    const selectedIndexEnd =
      selection.context.current.words.findIndex(
        (word) =>
          word === selection.selectedWords[selection.selectedWords.length - 1],
      ) + 1;

    return [
      {
        role: 'system',
        content: [
          'You are Kapter Lookup, a vocabulary lookup assistant inside a bilingual subtitle player.',
          `Write the contextualDefinition in ${targetLanguage}.`,
          'Return JSON only through the provided schema.',
          'Use the exact selected text. Do not rewrite or expand it.',
          'Interpret the meaning only within the supplied subtitle context.',
          'Do not return a generic dictionary gloss by itself.',
          'The contextualDefinition must explain what the selected text is doing in this exact sentence.',
          'State its grammatical role, structural behavior, or nuance in context.',
          'If it is a function word, particle, classifier, complement, aspect marker, discourse marker, or structural element, explicitly explain what it attaches to and what it changes in the sentence.',
          'If it is a content word, explain the sense it carries here and any collocation or nuance from the surrounding words.',
          'If the sentence meaning differs from the standalone dictionary meaning, prioritize the sentence-specific meaning.',
          'Keep the explanation compact but specific enough to teach why this word or phrase behaves this way here.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Selected text: ${selection.canonicalWordText}`,
          `Selected token positions: ${selectedIndexStart}${
            selectedIndexEnd > selectedIndexStart ? `-${selectedIndexEnd}` : ''
          }`,
          `Source language: ${selection.sourceLanguage}`,
          `Token order in current sentence: ${surroundingTokens}`,
          `Current sentence: ${selection.context.current.text}`,
          `Current translation: ${currentTranslation}`,
          `Previous sentence: ${previousText}`,
          `Next sentence: ${nextText}`,
          'Explain the selected text specifically in relation to this sentence, not as an isolated dictionary entry.',
        ].join('\n'),
      },
    ];
  }

  private async readLookupCache(
    cacheKey: string,
  ): Promise<LookupDataDto | null> {
    const cached = await this.redis.getJson<LookupCacheEntry | LookupDataDto>(
      cacheKey,
    );

    if (!cached) {
      return null;
    }

    if (this.isLookupCacheEntry(cached)) {
      return cached.promptVersion === this.config.lookupPromptVersion
        ? cached.data
        : null;
    }

    return null;
  }

  private async createSaveToken(
    userId: string,
    mediaId: string,
    dto: LookupRequestDto,
    selection: ResolvedSelection,
    data: LookupDataDto,
  ): Promise<string> {
    const saveToken = randomUUID();
    await this.redis.setJson<LookupSaveTokenEntry>(
      this.buildSaveTokenKey(saveToken),
      {
        userId,
        mediaId,
        segmentIndex: dto.segmentIndex,
        startWordIndex: dto.startWordIndex,
        endWordIndex: dto.endWordIndex,
        canonicalWordText: selection.canonicalWordText,
        normalizedWord: selection.normalizedWord,
        sourceLanguage: selection.sourceLanguage,
        data,
      },
      LOOKUP_CACHE_TTL_SECONDS,
    );

    return saveToken;
  }

  private async isSelectionSaved(
    userId: string,
    mediaId: string,
    dto: Pick<
      LookupRequestDto,
      'segmentIndex' | 'startWordIndex' | 'endWordIndex'
    >,
  ): Promise<boolean> {
    const existing = await this.prisma.userVocabulary.findUnique({
      where: {
        userId_mediaItemId_segmentIndex_startWordIndex_endWordIndex: {
          userId,
          mediaItemId: mediaId,
          segmentIndex: dto.segmentIndex,
          startWordIndex: dto.startWordIndex,
          endWordIndex: dto.endWordIndex,
        },
      },
      select: { id: true },
    });

    return Boolean(existing);
  }

  private mapProviderError(error: ChatProviderError): Error {
    switch (error.code) {
      case LookupErrorCode.RATE_LIMITED:
        return new HttpException(
          {
            code: LookupErrorCode.RATE_LIMITED,
            message: error.message,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case LookupErrorCode.LLM_ERROR:
        return new BadGatewayException({
          code: LookupErrorCode.LLM_ERROR,
          message: error.message,
        });
      case LookupErrorCode.LLM_UNAVAILABLE:
      default:
        return new ServiceUnavailableException({
          code: LookupErrorCode.LLM_UNAVAILABLE,
          message: error.message,
        });
    }
  }

  private mapSavedItem(
    value: SavedUserVocabularyRow,
  ): SaveLookupWordResponseDto['item'] {
    return {
      id: value.id,
      vocabularyId: value.vocabularyId,
      word: value.vocabulary.word,
      sourceLanguage: value.vocabulary.sourceLanguage,
      phonetic: value.phoneticSnapshot,
      partOfSpeech: value.partOfSpeech as LookupPartOfSpeech,
      contextualDefinition: value.contextualDefinition,
      exampleSentence: value.sourceSentence,
      exampleSentenceTranslation: value.sourceSentenceTranslation,
      mediaItemId: value.mediaItemId,
      segmentIndex: value.segmentIndex,
      startWordIndex: value.startWordIndex,
      endWordIndex: value.endWordIndex,
      createdAt: value.createdAt.toISOString(),
    };
  }

  private buildCacheKey(
    mediaId: string,
    segmentIndex: number,
    wordText: string,
  ): string {
    return `lookup:${mediaId}:${segmentIndex}:${wordText}`;
  }

  private buildRateLimitKey(userId: string): string {
    return `rate_limit:lookup:${userId}`;
  }

  private buildSaveTokenKey(saveToken: string): string {
    return `lookup-save:${saveToken}`;
  }

  private normalizeWord(value: string): string {
    return value
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  }

  private normalizeLanguage(value: string): string {
    const normalized = value.trim().split(/[-_]/)[0]?.toLocaleLowerCase();
    return normalized || 'und';
  }

  private joinWordValues(values: string[], isCjk: boolean): string {
    if (values.length === 0) {
      return '';
    }

    return values
      .join(isCjk ? '' : ' ')
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private isCjkSelection(
    context: CanonicalSubtitleContext,
    selectedWords: SubtitleWord[],
  ): boolean {
    const language = this.normalizeLanguage(
      context.current.detected_lang || context.sourceLanguage,
    );
    if (['zh', 'ja', 'ko'].includes(language)) {
      return true;
    }

    return selectedWords.some((word) => CJK_PATTERN.test(word.word));
  }

  private readExceptionMessage(error: BadRequestException): string {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object') {
      const candidate = response as { message?: string | string[] };
      if (typeof candidate.message === 'string') {
        return candidate.message;
      }
      if (Array.isArray(candidate.message)) {
        return candidate.message.join(' ');
      }
    }

    return error.message;
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private isLookupCacheEntry(
    value: LookupCacheEntry | LookupDataDto,
  ): value is LookupCacheEntry {
    return (
      typeof value === 'object' &&
      value !== null &&
      'promptVersion' in value &&
      'data' in value
    );
  }
}
