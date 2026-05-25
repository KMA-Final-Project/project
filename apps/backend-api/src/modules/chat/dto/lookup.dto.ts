import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export enum LookupPartOfSpeech {
  NOUN = 'noun',
  PRONOUN = 'pronoun',
  VERB = 'verb',
  ADJECTIVE = 'adjective',
  ADVERB = 'adverb',
  PARTICLE = 'particle',
  CLASSIFIER = 'classifier',
  PREPOSITION = 'preposition',
  CONJUNCTION = 'conjunction',
  INTERJECTION = 'interjection',
  PHRASE = 'phrase',
  IDIOM = 'idiom',
  PROPER_NOUN = 'proper_noun',
  OTHER = 'other',
}

export enum LookupErrorCode {
  INVALID_WORD_SELECTION = 'INVALID_WORD_SELECTION',
  INVALID_SAVE_TOKEN = 'INVALID_SAVE_TOKEN',
  MEDIA_NOT_FOUND = 'MEDIA_NOT_FOUND',
  SUBTITLE_CONTEXT_UNAVAILABLE = 'SUBTITLE_CONTEXT_UNAVAILABLE',
  LOOKUP_LIMIT_REACHED = 'LOOKUP_LIMIT_REACHED',
  RATE_LIMITED = 'RATE_LIMITED',
  LLM_UNAVAILABLE = 'LLM_UNAVAILABLE',
  LLM_ERROR = 'LLM_ERROR',
}

export class LookupRequestDto {
  @ApiProperty({
    example: 12,
    description: '0-based canonical subtitle segment index.',
  })
  @IsInt()
  @Min(0)
  segmentIndex!: number;

  @ApiProperty({
    example: 'already',
    description: 'Client-selected text for server-side validation only.',
    maxLength: 80,
  })
  @IsString()
  @MaxLength(80)
  wordText!: string;

  @ApiProperty({
    example: 3,
    description: '0-based inclusive start word index inside sentence.words.',
  })
  @IsInt()
  @Min(0)
  startWordIndex!: number;

  @ApiProperty({
    example: 3,
    description: '0-based inclusive end word index inside sentence.words.',
  })
  @IsInt()
  @Min(0)
  endWordIndex!: number;
}

export class LookupDataDto {
  @ApiProperty({ example: 'already' })
  word!: string;

  @ApiProperty({ example: 'ol-red-ee' })
  phonetic!: string;

  @ApiProperty({ enum: LookupPartOfSpeech, example: LookupPartOfSpeech.ADVERB })
  partOfSpeech!: LookupPartOfSpeech;

  @ApiProperty({
    example:
      'In this sentence, it means that the action happened before now or sooner than expected.',
  })
  contextualDefinition!: string;

  @ApiProperty({ example: 'I already told you.' })
  exampleSentence!: string;

  @ApiProperty({ example: 'Tôi đã nói với bạn rồi.' })
  exampleSentenceTranslation!: string;
}

export class LookupQuotaMetaDto {
  @ApiProperty({ enum: ['free', 'paid'], example: 'free' })
  tier!: 'free' | 'paid';

  @ApiPropertyOptional({ example: 20, nullable: true })
  dailyLimit!: number | null;

  @ApiPropertyOptional({ example: 14, nullable: true })
  remainingToday!: number | null;

  @ApiPropertyOptional({ example: 68342, nullable: true })
  resetsInSeconds!: number | null;
}

export class LookupMetaDto {
  @ApiProperty({ example: false })
  cacheHit!: boolean;

  @ApiProperty({ example: false })
  alreadySaved!: boolean;

  @ApiProperty({
    example: '1a87b8f0-7a49-4d62-af0f-54f6d063c8e6',
    description: 'Opaque lookup snapshot token required for Save Word.',
  })
  saveToken!: string;

  @ApiProperty({ type: LookupQuotaMetaDto })
  quota!: LookupQuotaMetaDto;
}

export class LookupResponseDto {
  @ApiProperty({ type: LookupDataDto })
  data!: LookupDataDto;

  @ApiProperty({ type: LookupMetaDto })
  meta!: LookupMetaDto;
}

export class SaveLookupWordDto extends LookupRequestDto {
  @ApiProperty({
    example: '1a87b8f0-7a49-4d62-af0f-54f6d063c8e6',
    description: 'Opaque lookup snapshot token received from POST /lookup.',
  })
  @IsUUID()
  saveToken!: string;
}

export class SavedLookupWordItemDto {
  @ApiProperty({ example: 'ccff0b65-0eca-4922-bdee-dc7144d4d4f3' })
  id!: string;

  @ApiProperty({ example: '42858ef7-f4d6-4a53-b013-6dbe4f7d6b38' })
  vocabularyId!: string;

  @ApiProperty({ example: 'already' })
  word!: string;

  @ApiProperty({ example: 'en' })
  sourceLanguage!: string;

  @ApiProperty({ example: 'ol-red-ee' })
  phonetic!: string;

  @ApiProperty({ enum: LookupPartOfSpeech, example: LookupPartOfSpeech.ADVERB })
  partOfSpeech!: LookupPartOfSpeech;

  @ApiProperty({
    example:
      'In this sentence, it means that the action happened before now or sooner than expected.',
  })
  contextualDefinition!: string;

  @ApiProperty({ example: 'I already told you.' })
  exampleSentence!: string;

  @ApiProperty({ example: 'Tôi đã nói với bạn rồi.' })
  exampleSentenceTranslation!: string;

  @ApiProperty({ example: 'media-1' })
  mediaItemId!: string;

  @ApiProperty({ example: 12 })
  segmentIndex!: number;

  @ApiProperty({ example: 3 })
  startWordIndex!: number;

  @ApiProperty({ example: 3 })
  endWordIndex!: number;

  @ApiProperty({ example: '2026-05-25T12:00:00.000Z' })
  createdAt!: string;
}

export class SaveLookupWordResponseDto {
  @ApiProperty({ example: true })
  created!: boolean;

  @ApiProperty({ type: SavedLookupWordItemDto })
  item!: SavedLookupWordItemDto;
}
