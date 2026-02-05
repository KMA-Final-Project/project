import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 'AUTH_001' })
  code: string;

  @ApiProperty({ example: 'Invalid credentials' })
  message: string;

  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: '2026-02-06T00:00:00.000Z' })
  timestamp: string;
}
