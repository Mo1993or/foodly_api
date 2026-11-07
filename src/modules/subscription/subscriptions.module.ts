import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';

import {
  Restaurant,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';

import {
  Offer,
  OfferSchema,
} from '../offers/schemas/offer.schema';

import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';

import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Subscription.name,
        schema: SubscriptionSchema,
      },
      {
        name: Restaurant.name,
        schema: RestaurantSchema,
      },
      {
        name: Offer.name,
        schema: OfferSchema,
      },
    ]),
    AuthModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}