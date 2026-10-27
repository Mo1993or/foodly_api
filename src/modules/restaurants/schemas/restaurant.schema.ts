
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

  // Logo facultatif
  @Prop({
    trim: true,
    default: '',
  })
  logoUrl: string;

  // Photo de couverture facultative
  @Prop({
    trim: true,
    default: '',
  })
  coverPhotoUrl: string;

  // Tableau facultatif de deux couleurs maximum
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

  // Coordonnées GPS facultatives
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

  // Lien vers le compte utilisateur du propriétaire
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  ownerId: Types.ObjectId;

  // Statut de validation du restaurant
  @Prop({
    required: true,
    enum: RestaurantStatus,
    default: RestaurantStatus.PENDING,
    index: true,
  })
  status: RestaurantStatus;

  // Administrateur ayant traité la demande
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
  })
  reviewedBy?: Types.ObjectId;

  // Motif du refus ou note administrative
  @Prop({
    trim: true,
    maxlength: 1000,
    default: '',
  })
  reviewNote: string;
  
  @Prop({ trim: true })
  commercialPhone?: string;
}

export const RestaurantSchema =
  SchemaFactory.createForClass(Restaurant);
