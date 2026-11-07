
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { Restaurant } from '../../restaurants/schemas/restaurant.schema';
import { Offer, OfferCode } from '../../offers/schemas/offer.schema';
import { User } from '../../users/shemas/user.shema';

export type SubscriptionDocument = HydratedDocument<Subscription>;

export enum SubscriptionRequestStatus {
  PENDING_PAYMENT = 'pending_payment',
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum SubscriptionPaymentMethod {
  WAVE = 'wave',
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Subscription {
  @Prop({
    type: Types.ObjectId,
    ref: Restaurant.name,
    required: true,
    index: true,
  })
  restaurantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Offer.name,
    required: true,
  })
  offerId: Types.ObjectId;

  @Prop({
    type: String,
    enum: OfferCode,
    required: true,
  })
  offerCode: OfferCode;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  offerName: string;

  @Prop({
    type: Number,
    required: true,
    min: 0,
  })
  amount: number;

  @Prop({
    type: String,
    enum: SubscriptionPaymentMethod,
    default: SubscriptionPaymentMethod.WAVE,
  })
  paymentMethod: SubscriptionPaymentMethod;

  @Prop({
    type: String,
    trim: true,
    default: '',
    maxlength: 150,
  })
  paymentReference: string;

  @Prop({
    type: String,
    enum: SubscriptionRequestStatus,
    default: SubscriptionRequestStatus.PENDING_PAYMENT,
    index: true,
  })
  status: SubscriptionRequestStatus;

  @Prop({
    type: Date,
    default: null,
  })
  startsAt: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  expiresAt: Date | null;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    default: null,
  })
  validatedBy: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  validatedAt: Date | null;

  @Prop({
    type: String,
    trim: true,
    default: '',
    maxlength: 1000,
  })
  rejectionReason: string;
}

export const SubscriptionSchema =
  SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({
  restaurantId: 1,
  createdAt: -1,
});
