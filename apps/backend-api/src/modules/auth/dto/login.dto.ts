import { ApiProperty } from '@nestjs/swagger';
import type { LoginPayload } from '@kapter/contracts';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { PASSWORD_REGEX } from 'src/common/constants';

export class LoginDto implements LoginPayload {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: 'PASSWORD_INVALID' })
  password: string;
}
