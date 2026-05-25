import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import { ExplainErrorCode, LookupErrorCode } from './dto';

type ProviderErrorCode = ExplainErrorCode | LookupErrorCode;

interface ProviderErrorMapping {
  rateLimited: ProviderErrorCode;
  llmUnavailable: ProviderErrorCode;
  llmError: ProviderErrorCode;
}

const DEFAULT_PROVIDER_ERROR_MAPPING: ProviderErrorMapping = {
  rateLimited: ExplainErrorCode.RATE_LIMITED,
  llmUnavailable: ExplainErrorCode.LLM_UNAVAILABLE,
  llmError: ExplainErrorCode.LLM_ERROR,
};

export class ChatProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChatProviderError';
  }
}

export const mapOpenAiProviderError = (
  error: unknown,
  mapping: ProviderErrorMapping = DEFAULT_PROVIDER_ERROR_MAPPING,
): ChatProviderError => {
  if (
    error instanceof RateLimitError ||
    (error instanceof APIError && error.status === 429)
  ) {
    return new ChatProviderError(
      mapping.rateLimited,
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
      mapping.llmUnavailable,
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
      mapping.llmError,
      'AI assistant could not complete this request.',
    );
  }

  return new ChatProviderError(
    mapping.llmUnavailable,
    'AI assistant is temporarily unavailable.',
  );
};
