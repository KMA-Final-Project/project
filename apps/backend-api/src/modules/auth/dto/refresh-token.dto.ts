import { ApiProperty } from '@nestjs/swagger';
import type { RefreshTokenPayload } from '@kapter/contracts';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto implements RefreshTokenPayload {
  @ApiProperty({ description: 'Refresh token string' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
