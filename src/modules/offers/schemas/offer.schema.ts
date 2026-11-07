
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OfferDocument = HydratedDocument<Offer>;

export enum OfferCode {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  PREMIUM = 'PREMIUM',
}

export enum OfferBillingPeriod {
  NONE = 'NONE',
  MONTHLY = 'MONTHLY',
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Offer {
  @Prop({
    required: true,
    enum: OfferCode,
    unique: true,
    index: true,
  })
  code: OfferCode;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  name: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 500,
  })
  description: string;

  @Prop({
    required: true,
    min: 0,
  })
  price: number;

  @Prop({
    required: true,
    enum: OfferBillingPeriod,
    default: OfferBillingPeriod.MONTHLY,
  })
  billingPeriod: OfferBillingPeriod;

  @Prop({
    type: [String],
    default: [],
  })
  features: string[];

  @Prop({
    default: false,
  })
  isPopular: boolean;

  @Prop({
    default: true,
    index: true,
  })
  isActive: boolean;

  @Prop({
    default: 0,
  })
  sortOrder: number;
}

export const OfferSchema = SchemaFactory.createForClass(Offer);
