import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  OfferBillingPeriod,
  OfferCode,
} from '../schemas/offer.schema';

export class CreateOfferDto {
  @IsEnum(OfferCode)
  code: OfferCode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @IsNumber()
  @Min(0)
  @Max(100000000)
  price: number;

  @IsEnum(OfferBillingPeriod)
  billingPeriod: OfferBillingPeriod;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  features: string[];

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}