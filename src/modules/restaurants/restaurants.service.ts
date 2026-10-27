
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/user.service';
import { UserRole } from '../users/shemas/user.shema';

import {
  Restaurant,
  RestaurantDocument,
  RestaurantStatus,
} from './schemas/restaurant.schema';

import { RegisterRestaurantDto } from './dto/register-restaurant.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    private readonly usersService: UsersService,
  ) {}

  async registerRestaurant(dto: RegisterRestaurantDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.createUser({
      name: dto.ownerName,
      email: dto.email,
      passwordHash,
      role: UserRole.RESTAURATEUR,
    });

    const restaurant = await this.restaurantModel.create({
      name: dto.restaurantName,
      address: dto.address,
      phone: dto.phone,
      restaurantType: dto.restaurantType,
      description: dto.description ?? '',
      logoUrl: dto.logoUrl ?? '',
      coverPhotoUrl: dto.coverPhotoUrl ?? '',
      colors: dto.colors ?? [],
      latitude: dto.latitude,
      longitude: dto.longitude,
      ownerName: dto.ownerName.trim(),
      ownerEmail: dto.email.trim().toLowerCase(),
      ownerId: user._id,
      commercialPhone: dto.commercialPhone,
      status: RestaurantStatus.PENDING,
      reviewNote: '',
    });

    return {
      message:
        'Inscription réussie. Votre restaurant est en attente de validation.',
      data: {
        owner: user,
        restaurant,
      },
    };
  }

  async findAll() {
    return this.restaurantModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
  }

  async findPending() {
    return this.restaurantModel
      .find({ status: RestaurantStatus.PENDING })
      .sort({ createdAt: -1 })
      .exec();
  }

  async approveRestaurant(
    restaurantId: string,
    reviewerId: string,
  ) {
    const restaurant = await this.findRestaurantById(restaurantId);

    if (restaurant.status !== RestaurantStatus.PENDING) {
      throw new BadRequestException(
        'Seuls les restaurants en attente peuvent être approuvés.',
      );
    }

    restaurant.status = RestaurantStatus.APPROVED;
    restaurant.reviewedBy = new Types.ObjectId(reviewerId);
    restaurant.reviewNote = '';

    await restaurant.save();

    return {
      message: 'Restaurant approuvé avec succès.',
      data: restaurant,
    };
  }

  async rejectRestaurant(
    restaurantId: string,
    reviewerId: string,
    reviewNote?: string,
  ) {
    const restaurant = await this.findRestaurantById(restaurantId);

    if (restaurant.status !== RestaurantStatus.PENDING) {
      throw new BadRequestException(
        'Seuls les restaurants en attente peuvent être refusés.',
      );
    }

    restaurant.status = RestaurantStatus.REJECTED;
    restaurant.reviewedBy = new Types.ObjectId(reviewerId);
    restaurant.reviewNote = reviewNote?.trim() ?? '';

    await restaurant.save();

    return {
      message: 'Demande de restaurant refusée.',
      data: restaurant,
    };
  }

  private async findRestaurantById(
    restaurantId: string,
  ): Promise<RestaurantDocument> {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException(
        'Identifiant du restaurant invalide.',
      );
    }

    const restaurant = await this.restaurantModel
      .findById(restaurantId)
      .exec();

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    return restaurant;
  }
}
