import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Sentence as SubtitleSegment,
  SubtitleOutput,
  TranslatedBatch,
  Word as SubtitleWord,
} from '@kapter/contracts';
import { createHash } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/modules/minio/minio.service';

export interface CanonicalSubtitleContext {
  mediaId: string;
  segmentIndex: number;
  sourceLanguage: string;
  targetLanguage: string;
  current: SubtitleSegment;
  previous: SubtitleSegment | null;
  next: SubtitleSegment | null;
  contextHash: string;
}

export type { SubtitleSegment, SubtitleWord };

@Injectable()
export class ChatContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
  ) {}

  async resolveCanonicalContext(
    userId: string,
    mediaId: string,
    segmentIndex: number,
  ): Promise<CanonicalSubtitleContext> {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, userId, deletedAt: null },
      select: {
        id: true,
        sourceLanguage: true,
        targetLanguage: true,
        subtitleS3Key: true,
      },
    });

    if (!media) {
      throw new NotFoundException('Media item not found');
    }

    const finalContext = await this.tryResolveFromFinalArtifact(
      media.id,
      media.subtitleS3Key,
      media.targetLanguage ?? '',
      segmentIndex,
    );

    if (finalContext) {
      return finalContext;
    }

    const batchContext = await this.tryResolveFromTranslatedBatches(
      media.id,
      media.sourceLanguage ?? '',
      media.targetLanguage ?? '',
      segmentIndex,
    );

    if (batchContext) {
      return batchContext;
    }

    throw new BadRequestException('Subtitle context is not available yet');
  }

  private async tryResolveFromFinalArtifact(
    mediaId: string,
    subtitleS3Key: string | null,
    mediaTargetLanguage: string,
    segmentIndex: number,
  ): Promise<CanonicalSubtitleContext | null> {
    const candidateKeys = [
      subtitleS3Key,
      MinioService.finalResultObjectKey(mediaId),
    ].filter((key): key is string => Boolean(key));

    for (const objectKey of [...new Set(candidateKeys)]) {
      try {
        const output =
          await this.minioService.readProcessedJson<SubtitleOutput>(objectKey);
        const segments = Array.isArray(output.segments) ? output.segments : [];
        const current = this.findSegment(segments, segmentIndex);

        if (!current) {
          continue;
        }

        return this.createContext({
          mediaId,
          segmentIndex,
          sourceLanguage:
            output.metadata?.source_lang || current.detected_lang || '',
          targetLanguage: output.metadata?.target_lang || mediaTargetLanguage,
          current,
          previous: this.findSegment(segments, segmentIndex - 1),
          next: this.findSegment(segments, segmentIndex + 1),
        });
      } catch {
        continue;
      }
    }

    return null;
  }

  private async tryResolveFromTranslatedBatches(
    mediaId: string,
    mediaSourceLanguage: string,
    mediaTargetLanguage: string,
    segmentIndex: number,
  ): Promise<CanonicalSubtitleContext | null> {
    const inventory = await this.minioService.listProcessedArtifacts(mediaId);

    for (const artifact of inventory.translatedBatches) {
      try {
        const batch =
          await this.minioService.readProcessedJson<TranslatedBatch>(
            artifact.objectKey,
          );
        const segments = Array.isArray(batch.segments) ? batch.segments : [];
        const current = this.findSegment(segments, segmentIndex);

        if (!current) {
          continue;
        }

        return this.createContext({
          mediaId,
          segmentIndex,
          sourceLanguage: current.detected_lang || mediaSourceLanguage,
          targetLanguage: mediaTargetLanguage,
          current,
          previous: this.findSegment(segments, segmentIndex - 1),
          next: this.findSegment(segments, segmentIndex + 1),
        });
      } catch {
        continue;
      }
    }

    return null;
  }

  private findSegment(
    segments: SubtitleSegment[],
    segmentIndex: number,
  ): SubtitleSegment | null {
    if (segmentIndex < 0) {
      return null;
    }

    return (
      segments.find((segment) => segment.segment_index === segmentIndex) ??
      segments[segmentIndex] ??
      null
    );
  }

  private createContext(input: Omit<CanonicalSubtitleContext, 'contextHash'>) {
    const contextHash = createHash('sha256')
      .update(
        JSON.stringify({
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
          current: this.hashableSegment(input.current),
          previous: input.previous
            ? this.hashableSegment(input.previous)
            : null,
          next: input.next ? this.hashableSegment(input.next) : null,
        }),
      )
      .digest('hex')
      .slice(0, 16);

    return { ...input, contextHash };
  }

  private hashableSegment(segment: SubtitleSegment) {
    return {
      segment_index: segment.segment_index,
      text: segment.text,
      translation: segment.translation,
      phonetic: segment.phonetic,
      detected_lang: segment.detected_lang,
      words: Array.isArray(segment.words)
        ? segment.words.map((word) => ({
            word: word.word,
            phoneme: word.phoneme,
          }))
        : [],
    };
  }
}
