
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class CreateSubscriptionDto {
  @IsMongoId()
  @IsNotEmpty()
  restaurantId: string;

  @IsMongoId()
  @IsNotEmpty()
  offerId: string;
}
