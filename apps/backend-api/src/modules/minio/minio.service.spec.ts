import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

import { MinioService } from './minio.service';

type MockClient = {
  presignedPutObject: jest.Mock;
  presignedGetObject: jest.Mock;
  statObject: jest.Mock;
  fGetObject: jest.Mock;
  fPutObject: jest.Mock;
  listObjectsV2: jest.Mock;
};

const clientMocks: MockClient[] = [];

jest.mock('minio', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      const mockClient: MockClient = {
        presignedPutObject: jest.fn(),
        presignedGetObject: jest.fn(),
        statObject: jest.fn(),
        fGetObject: jest.fn(),
        fPutObject: jest.fn(),
        listObjectsV2: jest.fn(),
      };

      clientMocks.push(mockClient);
      return mockClient;
    }),
  };
});

describe('MinioService', () => {
  const config: Record<string, string> = {
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'access-key',
    MINIO_SECRET_KEY: 'secret-key',
    MINIO_BUCKET_RAW: 'raw',
    MINIO_BUCKET_PROCESSED: 'processed',
    MINIO_PUBLIC_ENDPOINT: 'https://bilingual-minio.sondndev.id.vn',
  };

  const createConfigService = (): ConfigService =>
    ({
      get: jest.fn((key: string, fallback?: string) => config[key] ?? fallback),
      getOrThrow: jest.fn((key: string) => {
        const value = config[key];
        if (value === undefined) {
          throw new Error(`Missing config key: ${key}`);
        }
        return value;
      }),
    }) as unknown as ConfigService;

  beforeEach(() => {
    clientMocks.length = 0;
    jest.clearAllMocks();
  });

  it('generates presigned GET urls with the public client host', async () => {
    const service = new MinioService(createConfigService());
    const [, publicClient] = clientMocks;

    publicClient.presignedGetObject.mockResolvedValue(
      'https://bilingual-minio.sondndev.id.vn/processed/media-123/final.json?X-Amz-Signature=good',
    );

    const url = await service.generatePresignedGetUrl('media-123/final.json');

    expect(Minio.Client).toHaveBeenNthCalledWith(1, {
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'access-key',
      secretKey: 'secret-key',
    });
    expect(Minio.Client).toHaveBeenNthCalledWith(2, {
      endPoint: 'bilingual-minio.sondndev.id.vn',
      port: 443,
      useSSL: true,
      accessKey: 'access-key',
      secretKey: 'secret-key',
    });
    expect(publicClient.presignedGetObject).toHaveBeenCalledWith(
      'processed',
      'media-123/final.json',
      3600,
    );
    expect(url).toContain(
      'bilingual-minio.sondndev.id.vn/processed/media-123/final.json',
    );
  });

  it('generates presigned PUT urls with the public client host', async () => {
    const service = new MinioService(createConfigService());
    const [, publicClient] = clientMocks;

    publicClient.presignedPutObject.mockResolvedValue(
      'https://bilingual-minio.sondndev.id.vn/raw/uploaded/file.mp3?X-Amz-Signature=good',
    );

    const url = await service.generatePresignedPutUrl('uploaded/file.mp3');

    expect(publicClient.presignedPutObject).toHaveBeenCalledWith(
      'raw',
      'uploaded/file.mp3',
      3600,
    );
    expect(url).toContain(
      'bilingual-minio.sondndev.id.vn/raw/uploaded/file.mp3',
    );
  });
});
