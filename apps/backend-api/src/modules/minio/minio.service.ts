import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

export interface ProcessedArtifactBase {
  objectKey: string;
  size: number;
  lastModified: Date | null;
}

export interface ProcessedChunkArtifact extends ProcessedArtifactBase {
  kind: 'chunk';
  chunkIndex: number;
}

export interface ProcessedTranslatedBatchArtifact extends ProcessedArtifactBase {
  kind: 'translated_batch';
  batchIndex: number;
}

export interface ProcessedFinalArtifact extends ProcessedArtifactBase {
  kind: 'final';
}

export interface ProcessedArtifactSummary {
  chunkCount: number;
  translatedBatchCount: number;
  hasFinal: boolean;
  latestChunkIndex: number | null;
  latestBatchIndex: number | null;
  finalObjectKey: string | null;
}

export interface ProcessedArtifactInventory {
  mediaId: string;
  chunks: ProcessedChunkArtifact[];
  translatedBatches: ProcessedTranslatedBatchArtifact[];
  final: ProcessedFinalArtifact | null;
  summary: ProcessedArtifactSummary;
}

interface ListedBucketObject {
  name: string;
  size?: number;
  lastModified?: Date;
}

/**
 * Service wrapping the MinIO JS SDK for object storage operations.
 *
 * Key responsibilities:
 * - Generate presigned PUT URLs for direct client uploads
 * - Transform internal Docker URLs to public-facing URLs
 * - Verify object existence after upload confirmation
 * - Discover processed AI Engine artifacts for reconnect-safe Backend delivery
 */
@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Minio.Client;
  private readonly bucketRaw: string;
  private readonly bucketProcessed: string;
  private readonly publicEndpoint: string;
  private readonly internalOrigin: string;

  constructor(private readonly configService: ConfigService) {
    const endPoint = this.configService.getOrThrow<string>('MINIO_ENDPOINT');
    const port = Number(this.configService.getOrThrow<string>('MINIO_PORT'));
    const useSSL =
      this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';

    this.client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey: this.configService.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: this.configService.getOrThrow<string>('MINIO_SECRET_KEY'),
    });

    this.bucketRaw = this.configService.get<string>('MINIO_BUCKET_RAW', 'raw');
    this.bucketProcessed = this.configService.get<string>(
      'MINIO_BUCKET_PROCESSED',
      'processed',
    );
    this.publicEndpoint = this.configService.getOrThrow<string>(
      'MINIO_PUBLIC_ENDPOINT',
    );

    const protocol = useSSL ? 'https' : 'http';
    const isDefaultPort = (useSSL && port === 443) || (!useSSL && port === 80);
    this.internalOrigin = isDefaultPort
      ? `${protocol}://${endPoint}`
      : `${protocol}://${endPoint}:${port}`;

    this.logger.log(
      `MinIO initialized (internal: ${this.internalOrigin}, public: ${this.publicEndpoint})`,
    );
  }

  static chunkObjectKey(mediaId: string, chunkIndex: number): string {
    return `${mediaId}/chunks/${chunkIndex}.json`;
  }

  static translatedBatchObjectKey(mediaId: string, batchIndex: number): string {
    return `${mediaId}/translated_batches/${batchIndex}.json`;
  }

  static finalResultObjectKey(mediaId: string): string {
    return `${mediaId}/final.json`;
  }

  async generatePresignedPutUrl(
    objectKey: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    const internalUrl = await this.client.presignedPutObject(
      this.bucketRaw,
      objectKey,
      expirySeconds,
    );

    const publicUrl = internalUrl.replace(
      this.internalOrigin,
      this.publicEndpoint,
    );

    this.logger.debug(`Presigned URL generated for: ${objectKey}`);
    return publicUrl;
  }

  async generatePresignedGetUrl(
    objectKey: string,
    bucket?: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    const targetBucket = bucket ?? this.bucketProcessed;
    const internalUrl = await this.client.presignedGetObject(
      targetBucket,
      objectKey,
      expirySeconds,
    );

    const publicUrl = internalUrl.replace(
      this.internalOrigin,
      this.publicEndpoint,
    );

    this.logger.debug(`Presigned GET URL generated for: ${objectKey}`);
    return publicUrl;
  }

  async verifyObjectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucketRaw, objectKey);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'NotFound'
      ) {
        return false;
      }

      this.logger.error(
        `MinIO statObject failed for ${objectKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async downloadObject(objectKey: string, localPath: string): Promise<void> {
    await this.client.fGetObject(this.bucketRaw, objectKey, localPath);
    this.logger.debug(`Downloaded ${objectKey} → ${localPath}`);
  }

  async uploadFile(objectKey: string, localPath: string): Promise<void> {
    await this.client.fPutObject(this.bucketRaw, objectKey, localPath);
    this.logger.debug(`Uploaded ${localPath} → ${objectKey}`);
  }

  async listProcessedArtifacts(
    mediaId: string,
  ): Promise<ProcessedArtifactInventory> {
    const prefix = `${mediaId}/`;
    const objects = await this.listObjects(this.bucketProcessed, prefix);

    const chunks: ProcessedChunkArtifact[] = [];
    const translatedBatches: ProcessedTranslatedBatchArtifact[] = [];
    let final: ProcessedFinalArtifact | null = null;

    for (const object of objects) {
      const parsed = this.parseProcessedArtifactKey(mediaId, object.name);
      if (!parsed) {
        continue;
      }

      const base: ProcessedArtifactBase = {
        objectKey: object.name,
        size: object.size ?? 0,
        lastModified: object.lastModified ?? null,
      };

      switch (parsed.kind) {
        case 'chunk':
          chunks.push({
            ...base,
            kind: 'chunk',
            chunkIndex: parsed.chunkIndex,
          });
          break;
        case 'translated_batch':
          translatedBatches.push({
            ...base,
            kind: 'translated_batch',
            batchIndex: parsed.batchIndex,
          });
          break;
        case 'final':
          final = { ...base, kind: 'final' };
          break;
      }
    }

    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    translatedBatches.sort((a, b) => a.batchIndex - b.batchIndex);

    return {
      mediaId,
      chunks,
      translatedBatches,
      final,
      summary: {
        chunkCount: chunks.length,
        translatedBatchCount: translatedBatches.length,
        hasFinal: final !== null,
        latestChunkIndex:
          chunks.length > 0 ? chunks[chunks.length - 1].chunkIndex : null,
        latestBatchIndex:
          translatedBatches.length > 0
            ? translatedBatches[translatedBatches.length - 1].batchIndex
            : null,
        finalObjectKey: final?.objectKey ?? null,
      },
    };
  }

  private async listObjects(
    bucket: string,
    prefix: string,
  ): Promise<ListedBucketObject[]> {
    return new Promise((resolve, reject) => {
      const objects: ListedBucketObject[] = [];
      const stream = this.client.listObjectsV2(bucket, prefix, true);

      stream.on('data', (object: ListedBucketObject) => {
        if (object.name) {
          objects.push(object);
        }
      });
      stream.on('error', (error: unknown) => {
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to list objects from MinIO'),
        );
      });
      stream.on('end', () => resolve(objects));
    });
  }

  private parseProcessedArtifactKey(
    mediaId: string,
    objectKey: string,
  ):
    | { kind: 'chunk'; chunkIndex: number }
    | { kind: 'translated_batch'; batchIndex: number }
    | { kind: 'final' }
    | null {
    const prefix = `${mediaId}/`;
    if (!objectKey.startsWith(prefix)) {
      return null;
    }

    const relativeKey = objectKey.slice(prefix.length);
    if (relativeKey === 'final.json') {
      return { kind: 'final' };
    }

    const [group, fileName, ...rest] = relativeKey.split('/');
    if (rest.length > 0 || !fileName?.endsWith('.json')) {
      return null;
    }

    const rawIndex = fileName.slice(0, -'.json'.length);
    if (!/^\d+$/.test(rawIndex)) {
      return null;
    }

    const parsedIndex = Number.parseInt(rawIndex, 10);
    if (group === 'chunks') {
      return { kind: 'chunk', chunkIndex: parsedIndex };
    }
    if (group === 'translated_batches') {
      return { kind: 'translated_batch', batchIndex: parsedIndex };
    }

    return null;
  }
}
