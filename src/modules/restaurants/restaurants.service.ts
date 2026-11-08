
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

  /**
   * Création automatique d'un compte restaurateur
   * et de son restaurant.
   *
   * Le restaurant est immédiatement approuvé.
   * Aucun abonnement ou essai gratuit n'est activé ici.
   */
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

      // Approbation automatique
      status: RestaurantStatus.APPROVED,
      reviewedBy: null,
      reviewNote: '',

      isOpen: false,

      // Aucun abonnement à la création
      activeOffer: '',
      subscriptionStatus: SubscriptionStatus.NOT_STARTED,
      trialStartedAt: null,
      trialEndsAt: null,
      subscriptionExpiresAt: null,
    });

    return {
      message:
        'Compte créé et restaurant approuvé avec succès. Vous pouvez maintenant choisir votre offre.',
      data: {
        owner: user,
        restaurant,
      },
    };
  }

  /**
   * Récupération de tous les restaurants.
   */
  async findAll() {
    return this.restaurantModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Récupération des restaurants encore en attente.
   * Principalement pour les anciennes demandes.
   */
  async findPending() {
    return this.restaurantModel
      .find({ status: RestaurantStatus.PENDING })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Approbation manuelle d'un ancien restaurant en attente.
   *
   * IMPORTANT :
   * L'approbation ne déclenche plus l'essai gratuit.
   * Le restaurateur doit choisir FREE pour démarrer
   * son essai de 10 jours.
   */
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

    if (!Types.ObjectId.isValid(reviewerId)) {
      throw new BadRequestException(
        'Identifiant de l’administrateur invalide.',
      );
    }

    restaurant.status = RestaurantStatus.APPROVED;
    restaurant.reviewedBy = new Types.ObjectId(reviewerId);
    restaurant.reviewNote = '';

    // Aucun abonnement n'est activé pendant l'approbation.
    restaurant.activeOffer = '';
    restaurant.subscriptionStatus = SubscriptionStatus.NOT_STARTED;
    restaurant.trialStartedAt = null;
    restaurant.trialEndsAt = null;
    restaurant.subscriptionExpiresAt = null;

    await restaurant.save();

    return {
      message:
        'Restaurant approuvé. Vous pouvez maintenant choisir une offre.',
      data: restaurant,
    };
  }

  /**
   * Refus d'un ancien restaurant en attente.
   */
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

    if (!Types.ObjectId.isValid(reviewerId)) {
      throw new BadRequestException(
        'Identifiant de l’administrateur invalide.',
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

  /**
   * Recherche d'un restaurant par son identifiant.
   */
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

  /**
   * Liste publique des restaurants approuvés.
   */
  async findPublicRestaurants(
    category?: string,
    search?: string,
  ) {
    const filter: any = {
      status: RestaurantStatus.APPROVED,
    };

    if (category?.trim()) {
      filter.restaurantType = {
        $regex: `^${category
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      };
    }

    if (search?.trim()) {
      filter.name = {
        $regex: search
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      };
    }

    return this.restaurantModel
      .find(filter)
      .select('-reviewNote -reviewedBy')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Modification de l'état ouvert/fermé du restaurant.
   */
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

  /**
   * Types de restaurants disponibles.
   */
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
