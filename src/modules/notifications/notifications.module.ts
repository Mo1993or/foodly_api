
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

import {
  DeviceToken,
  DeviceTokenSchema,
} from './schemas/device-token.schema';

@Module({
  imports: [
    ConfigModule,

    // Accès au JwtService déjà configuré dans AuthModule
    AuthModule,

    MongooseModule.forFeature([
      {
        name: DeviceToken.name,
        schema: DeviceTokenSchema,
      },
    ]),
  ],

  controllers: [NotificationsController],

  providers: [NotificationsService],

  exports: [NotificationsService],
})
export class NotificationsModule {}
