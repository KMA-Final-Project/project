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
    return this.configService.get<string>('AI_EXPLAIN_PROMPT_VERSION') ?? 'v3';
  }

  get maxOutputTokens(): number {
    return Number(
      this.configService.get<string>('AI_EXPLAIN_MAX_OUTPUT_TOKENS') ?? 800,
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
}
