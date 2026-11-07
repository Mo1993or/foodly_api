
import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class SubmitPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  paymentReference: string;
}
