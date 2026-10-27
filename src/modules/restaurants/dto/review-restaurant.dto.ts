
import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReviewRestaurantDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
