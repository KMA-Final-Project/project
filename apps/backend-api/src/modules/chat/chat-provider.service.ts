import { Inject, Injectable } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatConfigService } from './chat-config.service';
import { OPENAI_CLIENT, type OpenAiClient } from './chat-provider.constants';
import {
  ChatProviderError,
  mapOpenAiProviderError,
} from './chat-provider.errors';
import { ExplainErrorCode } from './dto';

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionChunk {
  content: string;
  finishReason?: string;
}

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
}
