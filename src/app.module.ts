
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import * as Joi from 'joi';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/user.module';
import { MediaModule } from './modules/media/media.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OffersModule } from './modules/offers/offers.module';
import { SubscriptionsModule } from './modules/subscription/subscriptions.module';

@Module({
  imports: [
    // Configuration et validation des variables d'environnement
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),

        PORT: Joi.number().port().default(3000),

        MONGODB_URI: Joi.string().required(),

        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        
        CLOUDINARY_API_KEY: Joi.string().required(),
        
        CLOUDINARY_API_SECRET: Joi.string().required(),

        JWT_SECRET: Joi.string().min(32).required(),

        JWT_EXPIRES_IN: Joi.string().default('1d'),

        CORS_ORIGINS: Joi.string().allow('').default(''),
      }),
    }),

    // Connexion à MongoDB Atlas
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
        serverSelectionTimeoutMS: 10000,
        autoIndex:
          configService.get<string>('NODE_ENV') !== 'production',
      }),
    }),

    MediaModule,
    AuthModule,
    UsersModule,
    RestaurantsModule,
    ProductsModule,
    OrdersModule,
    OffersModule,
    SubscriptionsModule
  ],
})
export class AppModule {}
