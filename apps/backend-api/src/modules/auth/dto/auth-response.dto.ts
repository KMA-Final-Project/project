import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  fullName: string;

  @ApiProperty({ example: true })
  emailVerified: boolean;
}

export class TokensDto {
  @ApiProperty({ description: 'JWT access token (short-lived)' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh token (long-lived)' })
  refreshToken: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ type: TokensDto })
  tokens: TokensDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;
}
