import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';
import { WordBankListResponseDto } from './dto';
import { VocabularyService } from './vocabulary.service';

@ApiTags('Word Bank')
@ApiBearerAuth()
@Controller('vocabulary')
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get()
  @ApiOperation({
    summary: 'List grouped saved vocabulary for the authenticated user',
    description:
      'Returns canonical word groups with expandable historical save contexts enriched with media identity data.',
  })
  @ApiResponse({ status: 200, type: WordBankListResponseDto })
  async listWordBank(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WordBankListResponseDto> {
    return this.vocabularyService.listWordBank(user.id);
  }
}
