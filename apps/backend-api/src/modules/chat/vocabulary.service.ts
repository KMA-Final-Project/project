import { Injectable } from '@nestjs/common';
import { MinioService } from 'src/modules/minio/minio.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { LookupPartOfSpeech } from './dto';
import {
  WordBankContextItemDto,
  WordBankGroupItemDto,
  WordBankListResponseDto,
} from './dto/word-bank.dto';

interface WordBankRow {
  id: string;
  mediaItemId: string;
  segmentIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  selectedTextSnapshot: string;
  phoneticSnapshot: string;
  partOfSpeech: string;
  contextualDefinition: string;
  sourceSentence: string;
  sourceSentenceTranslation: string;
  createdAt: Date;
  vocabulary: {
    id: string;
    word: string;
    sourceLanguage: string;
    phonetic: string | null;
  };
  mediaItem: {
    id: string;
    title: string;
    originType: 'LOCAL' | 'YOUTUBE';
    youtubeVideoId: string | null;
    hasThumbnail: boolean;
    deletedAt: Date | null;
  };
}

@Injectable()
export class VocabularyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
  ) {}

  async listWordBank(userId: string): Promise<WordBankListResponseDto> {
    const rows = (await this.prisma.userVocabulary.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        mediaItemId: true,
        segmentIndex: true,
        startWordIndex: true,
        endWordIndex: true,
        selectedTextSnapshot: true,
        phoneticSnapshot: true,
        partOfSpeech: true,
        contextualDefinition: true,
        sourceSentence: true,
        sourceSentenceTranslation: true,
        createdAt: true,
        vocabulary: {
          select: {
            id: true,
            word: true,
            sourceLanguage: true,
            phonetic: true,
          },
        },
        mediaItem: {
          select: {
            id: true,
            title: true,
            originType: true,
            youtubeVideoId: true,
            hasThumbnail: true,
            deletedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })) as WordBankRow[];

    const thumbnailCache = new Map<string, Promise<string | null>>();
    const contexts = await Promise.all(
      rows.map((row) => this.mapContextItem(row, thumbnailCache)),
    );

    const groups = new Map<string, WordBankGroupItemDto>();

    rows.forEach((row, index) => {
      const context = contexts[index];
      if (!context) {
        return;
      }

      const existing = groups.get(row.vocabulary.id);
      if (existing) {
        existing.contexts.push(context);
        existing.contextCount += 1;
        if (!existing.phonetic && context.phonetic) {
          existing.phonetic = context.phonetic;
        }
        return;
      }

      groups.set(row.vocabulary.id, {
        vocabularyId: row.vocabulary.id,
        word: row.vocabulary.word,
        sourceLanguage: row.vocabulary.sourceLanguage,
        phonetic: row.vocabulary.phonetic?.trim() || context.phonetic,
        contextCount: 1,
        latestSavedAt: context.savedAt,
        contexts: [context],
      });
    });

    const data = Array.from(groups.values());

    return {
      data,
      meta: {
        totalGroups: data.length,
        totalContexts: contexts.length,
      },
    };
  }

  private async mapContextItem(
    row: WordBankRow,
    thumbnailCache: Map<string, Promise<string | null>>,
  ): Promise<WordBankContextItemDto> {
    const mediaAvailable = row.mediaItem.deletedAt === null;

    return {
      id: row.id,
      mediaItemId: row.mediaItemId,
      mediaTitle: row.mediaItem.title,
      mediaOriginType: row.mediaItem.originType,
      mediaThumbnailUrl: await this.resolveMediaThumbnailUrl(
        row,
        mediaAvailable,
        thumbnailCache,
      ),
      mediaAvailable,
      segmentIndex: row.segmentIndex,
      startWordIndex: row.startWordIndex,
      endWordIndex: row.endWordIndex,
      selectedText: row.selectedTextSnapshot,
      phonetic: row.phoneticSnapshot,
      partOfSpeech: row.partOfSpeech as LookupPartOfSpeech,
      savedContextualDefinition: row.contextualDefinition,
      savedExampleText: row.sourceSentence,
      savedExampleTranslation: row.sourceSentenceTranslation,
      savedAt: row.createdAt.toISOString(),
    };
  }

  private async resolveMediaThumbnailUrl(
    row: WordBankRow,
    mediaAvailable: boolean,
    thumbnailCache: Map<string, Promise<string | null>>,
  ): Promise<string | null> {
    if (!mediaAvailable) {
      return null;
    }

    if (
      row.mediaItem.originType === 'YOUTUBE' &&
      row.mediaItem.youtubeVideoId
    ) {
      return `https://img.youtube.com/vi/${row.mediaItem.youtubeVideoId}/hqdefault.jpg`;
    }

    if (row.mediaItem.originType !== 'LOCAL' || !row.mediaItem.hasThumbnail) {
      return null;
    }

    const cached = thumbnailCache.get(row.mediaItem.id);
    if (cached) {
      return cached;
    }

    const request = this.minioService.generatePresignedGetUrl(
      `${row.mediaItem.id}/thumbnail.jpg`,
    );
    thumbnailCache.set(row.mediaItem.id, request);
    return request;
  }
}
