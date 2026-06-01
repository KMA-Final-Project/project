import OpenAI from 'openai';
import { ChatConfigService } from './chat-config.service';
import { OPENAI_CLIENT } from './chat-provider.constants';

export const openAiClientProvider = {
  provide: OPENAI_CLIENT,
  useFactory: (config: ChatConfigService): OpenAI =>
    new OpenAI({
      apiKey: config.apiKey || 'missing-kapter-openai-api-key',
      baseURL: config.baseUrlNormalized,
      timeout: config.timeoutMs,
      maxRetries: 0,
    }),
  inject: [ChatConfigService],
};
