
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ArrayMaxSize,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterRestaurantDto {
  // Informations du propriétaire
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ownerName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password: string;

  // Informations du restaurant
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  restaurantName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  restaurantType: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  // Logo facultatif : URL de l'image
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  // Photo de couverture facultative : URL de l'image
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverPhotoUrl?: string;

  // Deux couleurs maximum
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { each: true })
  colors?: string[];

  // Coordonnées GPS facultatives
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;
  
  @IsOptional()
  @IsString()
  commercialPhone?: string;
}
