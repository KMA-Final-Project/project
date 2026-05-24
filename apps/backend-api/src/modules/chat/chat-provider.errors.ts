import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import { ExplainErrorCode } from './dto';

export class ChatProviderError extends Error {
  constructor(
    readonly code: ExplainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChatProviderError';
  }
}

export const mapOpenAiProviderError = (error: unknown): ChatProviderError => {
  if (
    error instanceof RateLimitError ||
    (error instanceof APIError && error.status === 429)
  ) {
    return new ChatProviderError(
      ExplainErrorCode.RATE_LIMITED,
      'The AI assistant is busy. Please try again shortly.',
    );
  }

  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIConnectionError ||
    (error instanceof APIError &&
      typeof error.status === 'number' &&
      error.status >= 500)
  ) {
    return new ChatProviderError(
      ExplainErrorCode.LLM_UNAVAILABLE,
      'AI assistant is temporarily unavailable.',
    );
  }

  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError ||
    error instanceof BadRequestError ||
    (error instanceof APIError &&
      typeof error.status === 'number' &&
      error.status >= 400 &&
      error.status < 500)
  ) {
    return new ChatProviderError(
      ExplainErrorCode.LLM_ERROR,
      'AI assistant could not complete this request.',
    );
  }

  return new ChatProviderError(
    ExplainErrorCode.LLM_UNAVAILABLE,
    'AI assistant is temporarily unavailable.',
  );
};
