import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import type {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  CheckoutSessionStatusResponse,
} from '@kapter/contracts';

export class CreateCheckoutSessionDto implements CreateCheckoutSessionRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  successUrl!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cancelUrl!: string;
}

export class CreateCheckoutSessionResponseDto implements CreateCheckoutSessionResponse {
  @ApiProperty() checkoutUrl!: string;
  @ApiProperty() sessionId!: string;
}

export class CheckoutSessionStatusResponseDto implements CheckoutSessionStatusResponse {
  @ApiProperty() sessionId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() completedAt!: string | null;
}
