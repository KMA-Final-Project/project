import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatConfigService {
  constructor(private readonly configService: ConfigService) {}

  get provider(): string {
    return this.configService.get<string>('AI_EXPLAIN_PROVIDER') ?? 'openai';
  }

  get baseUrl(): string {
    return (
      this.configService.get<string>('AI_EXPLAIN_BASE_URL') ??
      'https://api.openai.com/v1'
    );
  }

  get baseUrlNormalized(): string {
    return this.baseUrl.replace(/\/+$/, '');
  }

  get apiKey(): string {
    return this.configService.get<string>('AI_EXPLAIN_API_KEY') ?? '';
  }

  get model(): string {
    return this.configService.get<string>('AI_EXPLAIN_MODEL') ?? 'gpt-4o-mini';
  }

  get promptVersion(): string {
    return this.configService.get<string>('AI_EXPLAIN_PROMPT_VERSION') ?? 'v4';
  }

  get maxOutputTokens(): number {
    return Number(
      this.configService.get<string>('AI_EXPLAIN_MAX_OUTPUT_TOKENS') ?? 1200,
    );
  }

  get temperature(): number {
    return Number(
      this.configService.get<string>('AI_EXPLAIN_TEMPERATURE') ?? 0.2,
    );
  }

  get timeoutMs(): number {
    return Number(
      this.configService.get<string>('AI_EXPLAIN_TIMEOUT_MS') ?? 30_000,
    );
  }

  get lookupModel(): string {
    return this.configService.get<string>('AI_LOOKUP_MODEL') ?? 'gpt-4o-mini';
  }

  get lookupPromptVersion(): string {
    return (
      this.configService.get<string>('AI_LOOKUP_PROMPT_VERSION') ?? 'lookup-v2'
    );
  }

  get lookupMaxOutputTokens(): number {
    return Number(
      this.configService.get<string>('AI_LOOKUP_MAX_OUTPUT_TOKENS') ?? 280,
    );
  }

  get lookupTemperature(): number {
    return Number(
      this.configService.get<string>('AI_LOOKUP_TEMPERATURE') ?? 0.1,
    );
  }

  get lookupTimeoutMs(): number {
    return Number(
      this.configService.get<string>('AI_LOOKUP_TIMEOUT_MS') ?? 5_000,
    );
  }
}
