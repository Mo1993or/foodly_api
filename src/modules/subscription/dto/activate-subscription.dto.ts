
import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class ActivateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  paymentReference: string;
}
