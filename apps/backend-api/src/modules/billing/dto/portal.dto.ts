import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import type {
  CreatePortalSessionRequest,
  CreatePortalSessionResponse,
} from '@kapter/contracts';

export class CreatePortalSessionDto implements CreatePortalSessionRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;
}

export class CreatePortalSessionResponseDto implements CreatePortalSessionResponse {
  @ApiProperty() url!: string;
}
