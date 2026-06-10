import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import type {
  MobileWebHandoffRequest,
  MobileWebHandoffResponse,
  MobileWebHandoffConsumeRequest,
} from '@kapter/contracts';

export class MobileWebHandoffDto implements MobileWebHandoffRequest {
  @ApiProperty({ enum: ['pricing', 'account-subscription'] })
  @IsEnum(['pricing', 'account-subscription'])
  target!: 'pricing' | 'account-subscription';
}

export class MobileWebHandoffResponseDto implements MobileWebHandoffResponse {
  @ApiProperty() handoffUrl!: string;
  @ApiProperty() expiresInSeconds!: number;
}

export class MobileWebHandoffConsumeDto implements MobileWebHandoffConsumeRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;
}
