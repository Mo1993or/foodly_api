
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
  SubscriptionStatus,
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
      status: RestaurantStatus.APPROVED,
      reviewNote: '',
      isOpen: false,

      activeOffer: '',
      subscriptionStatus: SubscriptionStatus.NOT_STARTED,
      trialStartedAt: null,
      trialEndsAt: null,
      subscriptionExpiresAt: null,
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

    // Début de l'essai gratuit au moment de l'approbation.
    const trialStartedAt = new Date();

    // Durée de l'essai : 10 jours.
    const trialEndsAt = new Date(
      trialStartedAt.getTime() + 10 * 24 * 60 * 60 * 1000,
    );

    restaurant.status = RestaurantStatus.APPROVED;
    restaurant.reviewedBy = new Types.ObjectId(reviewerId);
    restaurant.reviewNote = '';

    restaurant.activeOffer = 'Free';
    restaurant.subscriptionStatus = SubscriptionStatus.TRIAL;
    restaurant.trialStartedAt = trialStartedAt;
    restaurant.trialEndsAt = trialEndsAt;
    restaurant.subscriptionExpiresAt = null;

    await restaurant.save();

    return {
      message: 'Restaurant approuvé. Essai gratuit de 10 jours activé.',
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

  async findPublicRestaurants(
    category?: string,
    search?: string,
  ) {
    const filter: any = {
      status: RestaurantStatus.APPROVED,
    };

    if (category?.trim()) {
      filter.restaurantType = {
        $regex: `^${category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      };
    }

    if (search?.trim()) {
      filter.name = {
        $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      };
    }

    return this.restaurantModel
      .find(filter)
      .select('-reviewNote -reviewedBy')
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateOpenStatus(
    restaurantId: string,
    ownerId: string,
    isOpen: boolean,
  ) {
    if (typeof isOpen !== 'boolean') {
      throw new BadRequestException(
        'Le champ isOpen doit être un booléen.',
      );
    }

    const restaurant = await this.findRestaurantById(restaurantId);

    if (restaurant.ownerId.toString() !== ownerId) {
      throw new BadRequestException(
        'Vous ne pouvez modifier que votre propre restaurant.',
      );
    }

    if (restaurant.status !== RestaurantStatus.APPROVED) {
      throw new BadRequestException(
        'Le restaurant doit être approuvé avant de modifier son état.',
      );
    }

    restaurant.isOpen = isOpen;
    await restaurant.save();

    return {
      message: isOpen
        ? 'Le restaurant est maintenant ouvert.'
        : 'Le restaurant est maintenant fermé.',
      data: restaurant,
    };
  }

  findRestaurantTypes() {
    return [
      'Tout',
      'Restaurant traditionnel',
      'Fast-food',
      'Pizzeria',
      'Grillades',
      'Cuisine sénégalaise',
      'Cuisine africaine',
      'Cuisine asiatique',
      'Pâtisserie',
      'Boulangerie',
      'Café',
      'Jus et boissons',
      'Restaurant gastronomique',
      'Végétarien',
      'Fruits de mer',
      'Autre',
    ];
  }

  /**
   * Récupération du restaurant associé à un restaurateur.
   */
  async findByOwnerId(ownerId: string) {
    if (!Types.ObjectId.isValid(ownerId)) {
      return null;
    }

    return this.restaurantModel
      .findOne({
        ownerId: new Types.ObjectId(ownerId),
      })
      .select('-ownerId -reviewedBy')
      .exec();
  }
}
