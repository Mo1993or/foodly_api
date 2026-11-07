
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

import {
  Order,
  OrderSchema,
} from './schemas/order.schema';

import {
  Product,
  ProductSchema,
} from '../products/schemas/product.schema';

import {
  Restaurant,
  RestaurantSchema,
} from '../restaurants/schemas/restaurant.schema';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,

    MongooseModule.forFeature([
      {
        name: Order.name,
        schema: OrderSchema,
      },
      {
        name: Product.name,
        schema: ProductSchema,
      },
      {
        name: Restaurant.name,
        schema: RestaurantSchema,
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
