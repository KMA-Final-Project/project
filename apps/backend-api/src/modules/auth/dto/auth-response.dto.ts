import { ApiProperty } from '@nestjs/swagger';
import type {
  AuthResponse,
  MessageResponse,
  Tokens,
  UserProfile,
} from '@kapter/contracts';
import { Role } from 'prisma/generated/client';

export class UserProfileDto implements UserProfile {
  @ApiProperty({ example: 'uuid-string' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  fullName!: string;

  @ApiProperty({ example: true })
  emailVerified!: boolean;

  @ApiProperty({ enum: Role, example: Role.ADMIN })
  role!: Role;
}

export class TokensDto implements Tokens {
  @ApiProperty({ description: 'JWT access token (short-lived)' })
  accessToken!: string;

  @ApiProperty({ description: 'Refresh token (long-lived)' })
  refreshToken!: string;
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;

  @ApiProperty({ type: TokensDto })
  tokens!: TokensDto;
}

export class MessageResponseDto implements MessageResponse {
  @ApiProperty({ example: 'Operation completed successfully' })
  message!: string;
}
