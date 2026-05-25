import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MinioModule } from 'src/modules/minio/minio.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatConfigService } from './chat-config.service';
import { AiCreditLedgerService } from './ai-credit-ledger.service';
import { ChatContextService } from './chat-context.service';
import { ChatProviderService } from './chat-provider.service';
import { OPENAI_CLIENT } from './chat-provider.constants';
import { openAiClientProvider } from './openai-client.provider';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';

@Module({
  imports: [PrismaModule, MinioModule],
  controllers: [ChatController, LookupController],
  providers: [
    ChatService,
    LookupService,
    ChatConfigService,
    AiCreditLedgerService,
    ChatContextService,
    openAiClientProvider,
    ChatProviderService,
  ],
  exports: [
    ChatService,
    LookupService,
    ChatConfigService,
    AiCreditLedgerService,
    ChatContextService,
    OPENAI_CLIENT,
    ChatProviderService,
  ],
})
export class ChatModule {}
