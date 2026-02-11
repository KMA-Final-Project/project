import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

/**
 * Service wrapping the MinIO JS SDK for object storage operations.
 *
 * Key responsibilities:
 * - Generate presigned PUT URLs for direct client uploads
 * - Transform internal Docker URLs to public-facing URLs
 * - Verify object existence after upload confirmation
 */
@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Minio.Client;
  private readonly bucketRaw: string;
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
    this.publicEndpoint = this.configService.getOrThrow<string>(
      'MINIO_PUBLIC_ENDPOINT',
    );

    // Build the internal origin for URL replacement
    // e.g. "http://minio:9000" or "https://bilingual-minio.sondndev.id.vn"
    // Omit default ports (443/80) since the SDK does the same in presigned URLs
    const protocol = useSSL ? 'https' : 'http';
    const isDefaultPort = (useSSL && port === 443) || (!useSSL && port === 80);
    this.internalOrigin = isDefaultPort
      ? `${protocol}://${endPoint}`
      : `${protocol}://${endPoint}:${port}`;

    this.logger.log(
      `MinIO initialized (internal: ${this.internalOrigin}, public: ${this.publicEndpoint})`,
    );
  }

  /**
   * Generate a presigned PUT URL for direct client upload.
   *
   * The URL is generated against the internal MinIO endpoint (Docker network),
   * then the host is replaced with the public-facing domain so mobile/browser
   * clients can reach it through Cloudflare tunnel.
   *
   * @param objectKey - S3 object key (e.g. "audio/{userId}/{uuid}/file.mp3")
   * @param expirySeconds - URL validity period (default: 1 hour)
   * @returns Public-facing presigned PUT URL
   */
  async generatePresignedPutUrl(
    objectKey: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    const internalUrl = await this.client.presignedPutObject(
      this.bucketRaw,
      objectKey,
      expirySeconds,
    );

    // Replace internal Docker host with public domain
    const publicUrl = internalUrl.replace(
      this.internalOrigin,
      this.publicEndpoint,
    );

    this.logger.debug(`Presigned URL generated for: ${objectKey}`);
    return publicUrl;
  }

  /**
   * Verify that an object exists in the raw bucket.
   * Used to confirm that a client-side upload completed successfully.
   *
   * @param objectKey - S3 object key to verify
   * @returns true if object exists, false otherwise
   */
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
      // Re-throw unexpected errors (connection issues, etc.)
      this.logger.error(
        `MinIO statObject failed for ${objectKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
