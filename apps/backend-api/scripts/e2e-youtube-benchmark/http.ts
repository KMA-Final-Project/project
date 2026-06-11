import axios, { AxiosError, type AxiosInstance } from 'axios';

import type {
  BenchmarkOptions,
  LoginResponse,
  MediaArtifactsResponse,
  MediaStatusResponse,
  SubmitYoutubeResponse,
} from './types';
import { round } from './utils';

const DEVICE_INFO = 'e2e-youtube-wer-suite';

export type ApiClient = {
  http: AxiosInstance;
  login(email: string, password: string): Promise<LoginResponse>;
  submitYoutube(
    accessToken: string,
    payload: {
      url: string;
      sourceLanguage: string;
      targetLanguage: string;
      title: string;
    },
  ): Promise<{
    response: SubmitYoutubeResponse;
    submitRoundTripMs: number;
    submitRequestStartedAt: string;
    submitResponseReceivedAt: string;
  }>;
  pollForCompletion(
    accessToken: string,
    mediaId: string,
    options: BenchmarkOptions,
    submitStartedAtMs: number,
  ): Promise<{
    status: MediaStatusResponse;
    timeline: Array<{
      tSeconds: number;
      at: string;
      status: string;
      progress: number;
      currentStep: string | null;
      estimatedTimeRemaining: number | null;
      sourceLanguage: string | null;
      targetLanguage: string | null;
      artifacts: MediaStatusResponse['artifacts'];
    }>;
    elapsedSeconds: number;
  }>;
  getArtifacts(
    accessToken: string,
    mediaId: string,
  ): Promise<MediaArtifactsResponse>;
};

export function createApiClient(baseUrl: string): ApiClient {
  const http = axios.create({
    baseURL: baseUrl,
    timeout: 60_000,
  });

  async function login(email: string, password: string): Promise<LoginResponse> {
    return withRetry(async () => {
      const response = await http.post<LoginResponse>(
        '/auth/login',
        { email, password },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-device-info': DEVICE_INFO,
          },
        },
      );
      return response.data;
    });
  }

  async function submitYoutube(
    accessToken: string,
    payload: {
      url: string;
      sourceLanguage: string;
      targetLanguage: string;
      title: string;
    },
  ): Promise<{
    response: SubmitYoutubeResponse;
    submitRoundTripMs: number;
    submitRequestStartedAt: string;
    submitResponseReceivedAt: string;
  }> {
    const submitStartedAt = Date.now();
    const submitRequestStartedAt = new Date(submitStartedAt).toISOString();
    const response = await withRetry(async () =>
      http.post<SubmitYoutubeResponse>('/media/youtube', payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-device-info': DEVICE_INFO,
        },
      }),
    );
    const submitResponseReceivedAt = new Date().toISOString();
    return {
      response: response.data,
      submitRoundTripMs: Date.now() - submitStartedAt,
      submitRequestStartedAt,
      submitResponseReceivedAt,
    };
  }

  async function pollForCompletion(
    accessToken: string,
    mediaId: string,
    options: BenchmarkOptions,
    submitStartedAtMs: number,
  ): Promise<{
    status: MediaStatusResponse;
    timeline: Array<{
      tSeconds: number;
      at: string;
      status: string;
      progress: number;
      currentStep: string | null;
      estimatedTimeRemaining: number | null;
      sourceLanguage: string | null;
      targetLanguage: string | null;
      artifacts: MediaStatusResponse['artifacts'];
    }>;
    elapsedSeconds: number;
  }> {
    const timeline: Array<{
      tSeconds: number;
      at: string;
      status: string;
      progress: number;
      currentStep: string | null;
      estimatedTimeRemaining: number | null;
      sourceLanguage: string | null;
      targetLanguage: string | null;
      artifacts: MediaStatusResponse['artifacts'];
    }> = [];
    const pollStartedAt = Date.now();

    while (Date.now() - pollStartedAt < options.timeoutMs) {
      try {
        const response = await http.get<MediaStatusResponse>(
          `/media/${mediaId}/status`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const status = response.data;
        timeline.push({
          tSeconds: round((Date.now() - submitStartedAtMs) / 1000, 3),
          at: new Date().toISOString(),
          status: status.status,
          progress: status.progress,
          currentStep: status.currentStep,
          estimatedTimeRemaining: status.estimatedTimeRemaining,
          sourceLanguage: status.sourceLanguage,
          targetLanguage: status.targetLanguage,
          artifacts: status.artifacts,
        });

        if (status.status === 'COMPLETED') {
          return {
            status,
            timeline,
            elapsedSeconds: round((Date.now() - submitStartedAtMs) / 1000, 3),
          };
        }

        if (status.status === 'FAILED') {
          return {
            status,
            timeline,
            elapsedSeconds: round((Date.now() - submitStartedAtMs) / 1000, 3),
          };
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          await wait(options.throttleBackoffMs);
          continue;
        }
        if (isRetryableNetworkError(error)) {
          await wait(options.pollIntervalMs);
          continue;
        }
        throw formatAxiosError(error);
      }

      await wait(options.pollIntervalMs);
    }

    throw new Error(
      `Timed out after ${options.timeoutMs / 1000}s waiting for media ${mediaId}`,
    );
  }

  async function getArtifacts(
    accessToken: string,
    mediaId: string,
  ): Promise<MediaArtifactsResponse> {
    const response = await withRetry(async () =>
      http.get<MediaArtifactsResponse>(`/media/${mediaId}/artifacts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    return response.data;
  }

  return {
    http,
    login,
    submitYoutube,
    pollForCompletion,
    getArtifacts,
  };
}

export async function fetchJsonFromUrl<T>(
  url: string,
  http?: AxiosInstance,
): Promise<T> {
  const client = http ?? axios;
  const response = await withRetry(async () =>
    client.get<T>(url, {
      responseType: 'json',
      timeout: 60_000,
    }),
  );
  return response.data;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatAxiosError(error: unknown): Error {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const details = buildAxiosErrorDetails(error);
  return new Error(details);
}

function buildAxiosErrorDetails(error: AxiosError): string {
  if (error.response) {
    return `${error.response.status} ${error.response.statusText} for ${error.config?.url}\n${JSON.stringify(error.response.data)}`;
  }
  return error.message;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }
      await wait(1_000 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (error.response?.status === 429) {
    return true;
  }

  const code = error.code ?? '';
  return (
    !error.response &&
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND'].includes(
      code,
    )
  );
}
