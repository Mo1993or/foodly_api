
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DeviceTokenDocument = HydratedDocument<DeviceToken>;

export enum DevicePlatform {
  ANDROID = 'android',
  IOS = 'ios',
}

@Schema({
  timestamps: true,
  collection: 'device_tokens',
})
export class DeviceToken {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    unique: true,
    trim: true,
  })
  token: string;

  @Prop({
    type: String,
    enum: DevicePlatform,
    required: true,
  })
  platform: DevicePlatform;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop({
    trim: true,
  })
  deviceId?: string;
}

export const DeviceTokenSchema =
  SchemaFactory.createForClass(DeviceToken);
