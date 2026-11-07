import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

import {
  Product,
  ProductSchema,
} from './schemas/product.schema';

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
        name: Product.name,
        schema: ProductSchema,
      },
      {
        name: Restaurant.name,
        schema: RestaurantSchema,
      },
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}