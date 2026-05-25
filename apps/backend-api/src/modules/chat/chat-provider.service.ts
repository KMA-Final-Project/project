import { Inject, Injectable } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatConfigService } from './chat-config.service';
import { OPENAI_CLIENT, type OpenAiClient } from './chat-provider.constants';
import {
  ChatProviderError,
  mapOpenAiProviderError,
} from './chat-provider.errors';
import { ExplainErrorCode, LookupErrorCode, LookupPartOfSpeech } from './dto';

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionChunk {
  content: string;
  finishReason?: string;
}

export interface LookupCompletionSchema {
  selectedText: string;
  partOfSpeech: LookupPartOfSpeech;
  contextualDefinition: string;
}

const LOOKUP_CONTEXTUAL_DEFINITION_MAX_LENGTH = 360;

@Injectable()
export class ChatProviderService {
  constructor(
    private readonly config: ChatConfigService,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAiClient,
  ) {}

  async *streamCompletion(
    messages: ChatCompletionMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<ChatCompletionChunk> {
    if (!this.config.apiKey) {
      throw new ChatProviderError(
        ExplainErrorCode.LLM_UNAVAILABLE,
        'AI assistant is temporarily unavailable.',
      );
    }

    try {
      const stream = await this.openai.chat.completions.create(
        {
          model: this.config.model,
          messages: messages as ChatCompletionMessageParam[],
          temperature: this.config.temperature,
          max_tokens: this.config.maxOutputTokens,
          stream: true,
        },
        {
          signal,
          timeout: this.config.timeoutMs,
          maxRetries: 0,
        },
      );

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const content = choice?.delta?.content ?? '';
        const finishReason = choice?.finish_reason ?? undefined;

        if (content || finishReason) {
          yield { content, finishReason };
        }
      }
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      throw mapOpenAiProviderError(error);
    }
  }

  async createLookupCompletion(
    messages: ChatCompletionMessage[],
    signal: AbortSignal,
  ): Promise<LookupCompletionSchema> {
    if (!this.config.apiKey) {
      throw new ChatProviderError(
        LookupErrorCode.LLM_UNAVAILABLE,
        'Vocabulary lookup is temporarily unavailable.',
      );
    }

    try {
      const response = await this.openai.chat.completions.create(
        {
          model: this.config.lookupModel,
          messages: messages as ChatCompletionMessageParam[],
          temperature: this.config.lookupTemperature,
          max_tokens: this.config.lookupMaxOutputTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'lookup_result',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'selectedText',
                  'partOfSpeech',
                  'contextualDefinition',
                ],
                properties: {
                  selectedText: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 80,
                  },
                  partOfSpeech: {
                    type: 'string',
                    enum: Object.values(LookupPartOfSpeech),
                  },
                  contextualDefinition: {
                    type: 'string',
                    minLength: 1,
                    maxLength: LOOKUP_CONTEXTUAL_DEFINITION_MAX_LENGTH,
                  },
                },
              },
            },
          },
        },
        {
          signal,
          timeout: this.config.lookupTimeoutMs,
          maxRetries: 0,
        },
      );

      const choice = response.choices[0];
      const refusal = (
        choice?.message as { refusal?: string | null } | undefined
      )?.refusal;
      if (refusal) {
        throw new ChatProviderError(
          LookupErrorCode.LLM_ERROR,
          'Vocabulary lookup could not complete this request.',
        );
      }

      const content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new ChatProviderError(
          LookupErrorCode.LLM_ERROR,
          'Vocabulary lookup could not complete this request.',
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new ChatProviderError(
          LookupErrorCode.LLM_ERROR,
          'Vocabulary lookup could not complete this request.',
        );
      }

      if (!this.isLookupCompletionSchema(parsed)) {
        throw new ChatProviderError(
          LookupErrorCode.LLM_ERROR,
          'Vocabulary lookup could not complete this request.',
        );
      }

      return parsed;
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      if (error instanceof ChatProviderError) {
        throw error;
      }

      throw mapOpenAiProviderError(error, {
        rateLimited: LookupErrorCode.RATE_LIMITED,
        llmUnavailable: LookupErrorCode.LLM_UNAVAILABLE,
        llmError: LookupErrorCode.LLM_ERROR,
      });
    }
  }

  private isLookupCompletionSchema(
    value: unknown,
  ): value is LookupCompletionSchema {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.selectedText === 'string' &&
      candidate.selectedText.trim().length > 0 &&
      candidate.selectedText.length <= 80 &&
      typeof candidate.contextualDefinition === 'string' &&
      candidate.contextualDefinition.trim().length > 0 &&
      candidate.contextualDefinition.length <=
        LOOKUP_CONTEXTUAL_DEFINITION_MAX_LENGTH &&
      typeof candidate.partOfSpeech === 'string' &&
      Object.values(LookupPartOfSpeech).includes(
        candidate.partOfSpeech as LookupPartOfSpeech,
      )
    );
  }
}
