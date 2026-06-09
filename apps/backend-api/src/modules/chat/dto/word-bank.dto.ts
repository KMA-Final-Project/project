import { ApiProperty } from '@nestjs/swagger';
import type {
  WordBankContextItem,
  WordBankGroupItem,
  WordBankListResponse,
} from '@kapter/contracts';
import { LookupPartOfSpeech } from './lookup.dto';

export class WordBankContextItemDto implements WordBankContextItem {
  @ApiProperty({ example: 'ccff0b65-0eca-4922-bdee-dc7144d4d4f3' })
  id!: string;

  @ApiProperty({ example: 'media-1' })
  mediaItemId!: string;

  @ApiProperty({ example: 'Learn Chinese with Storytelling' })
  mediaTitle!: string;

  @ApiProperty({ enum: ['LOCAL', 'YOUTUBE'], example: 'YOUTUBE' })
  mediaOriginType!: 'LOCAL' | 'YOUTUBE';

  @ApiProperty({
    example: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    nullable: true,
  })
  mediaThumbnailUrl!: string | null;

  @ApiProperty({ example: true })
  mediaAvailable!: boolean;

  @ApiProperty({ example: 12 })
  segmentIndex!: number;

  @ApiProperty({ example: 3 })
  startWordIndex!: number;

  @ApiProperty({ example: 3 })
  endWordIndex!: number;

  @ApiProperty({ example: '已经' })
  selectedText!: string;

  @ApiProperty({ example: 'yi jing' })
  phonetic!: string;

  @ApiProperty({ enum: LookupPartOfSpeech, example: LookupPartOfSpeech.ADVERB })
  partOfSpeech!: LookupPartOfSpeech;

  @ApiProperty({
    example:
      'In this sentence, it marks that the action happened earlier than the listener might expect.',
  })
  savedContextualDefinition!: string;

  @ApiProperty({ example: '我们已经知道了。' })
  savedExampleText!: string;

  @ApiProperty({ example: 'Chung ta da biet roi.' })
  savedExampleTranslation!: string;

  @ApiProperty({ example: '2026-05-25T12:00:00.000Z' })
  savedAt!: string;
}

export class WordBankGroupItemDto implements WordBankGroupItem {
  @ApiProperty({ example: '42858ef7-f4d6-4a53-b013-6dbe4f7d6b38' })
  vocabularyId!: string;

  @ApiProperty({ example: '已经' })
  word!: string;

  @ApiProperty({ example: 'zh' })
  sourceLanguage!: string;

  @ApiProperty({ example: 'yi jing' })
  phonetic!: string;

  @ApiProperty({ example: 4 })
  contextCount!: number;

  @ApiProperty({ example: '2026-05-25T12:00:00.000Z' })
  latestSavedAt!: string;

  @ApiProperty({ type: [WordBankContextItemDto] })
  contexts!: WordBankContextItemDto[];
}

export class WordBankListMetaDto {
  @ApiProperty({ example: 24 })
  totalGroups!: number;

  @ApiProperty({ example: 38 })
  totalContexts!: number;
}

export class WordBankListResponseDto implements WordBankListResponse {
  @ApiProperty({ type: [WordBankGroupItemDto] })
  data!: WordBankGroupItemDto[];

  @ApiProperty({ type: WordBankListMetaDto })
  meta!: WordBankListMetaDto;
}
