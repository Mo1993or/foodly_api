
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/shemas/user.shema';

export type RestaurantDocument = HydratedDocument<Restaurant>;

export enum RestaurantStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

export enum SubscriptionStatus {
  NOT_STARTED = 'not_started',
  TRIAL = 'trial',
  ACTIVE = 'active',
  PENDING_PAYMENT = 'pending_payment',
  EXPIRED = 'expired',
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Restaurant {
  // Informations du restaurant
  @Prop({
    required: true,
    trim: true,
    maxlength: 150,
  })
  name: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 300,
  })
  address: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 30,
  })
  phone: string;

  @Prop({
    trim: true,
    maxlength: 1000,
    default: '',
  })
  description: string;

  // Type de restaurant
  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  restaurantType: string;

  // Logo
  @Prop({
    trim: true,
    default: '',
  })
  logoUrl: string;

  // Photo de couverture
  @Prop({
    trim: true,
    default: '',
  })
  coverPhotoUrl: string;

  // Couleurs
  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (colors: string[]) =>
        Array.isArray(colors) && colors.length <= 2,
      message: 'Un restaurant peut choisir au maximum deux couleurs.',
    },
  })
  colors: string[];

  // Coordonnées GPS
  @Prop({
    type: Number,
    min: -90,
    max: 90,
  })
  latitude?: number;

  @Prop({
    type: Number,
    min: -180,
    max: 180,
  })
  longitude?: number;

  // Informations du propriétaire
  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  ownerName: string;

  @Prop({
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  })
  ownerEmail: string;

  // Compte utilisateur propriétaire
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  ownerId: Types.ObjectId;

  // Validation du restaurant
  @Prop({
    required: true,
    enum: RestaurantStatus,
    default: RestaurantStatus.PENDING,
    index: true,
  })
  status: RestaurantStatus;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
  })
  reviewedBy?: Types.ObjectId;

  @Prop({
    trim: true,
    maxlength: 1000,
    default: '',
  })
  reviewNote: string;

  @Prop({ trim: true })
  commercialPhone?: string;

  @Prop({ type: Boolean, default: false })
  isOpen: boolean;

  // Offre actuellement active
  @Prop({
    type: String,
    default: 'Free',
  })
  activeOffer: string;

  // Statut de l'abonnement
  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.NOT_STARTED,
    index: true,
  })
  subscriptionStatus: SubscriptionStatus;

  // Début de l'essai gratuit
  @Prop({
    type: Date,
    default: null,
  })
  trialStartedAt: Date | null;

  // Fin de l'essai gratuit
  @Prop({
    type: Date,
    default: null,
  })
  trialEndsAt: Date | null;

  // Expiration de l'abonnement payant
  @Prop({
    type: Date,
    default: null,
  })
  subscriptionExpiresAt: Date | null;
}

export const RestaurantSchema =
  SchemaFactory.createForClass(Restaurant);
