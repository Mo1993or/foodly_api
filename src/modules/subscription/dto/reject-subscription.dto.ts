
import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class RejectSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
