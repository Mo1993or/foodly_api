
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Product,
  ProductDocument,
} from './schemas/product.schema';

import {
  Restaurant,
  RestaurantDocument,
  RestaurantStatus,
  SubscriptionStatus,
} from '../restaurants/schemas/restaurant.schema';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,

    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
  ) {}

  async create(dto: CreateProductDto, userId: string) {
    const restaurant = await this.findOwnedRestaurant(
      dto.restaurantId,
      userId,
    );

    if (restaurant.status !== RestaurantStatus.APPROVED) {
      throw new BadRequestException(
        'Le restaurant doit être approuvé avant de publier des plats.',
      );
    }

    // Vérification de l'abonnement avant l'ajout d'un plat.
    await this.ensureSubscriptionActive(restaurant);

    const product = await this.productModel.create({
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      price: dto.price,
      category: dto.category.trim(),
      imageUrl: dto.imageUrl.trim(),
      imagePublicId: dto.imagePublicId ?? '',
      restaurantId: restaurant._id,
      isAvailable: true,
    });

    return {
      message: 'Plat ajouté avec succès.',
      data: product,
    };
  }

  async findAll(
    restaurantId?: string,
    category?: string,
    search?: string,
  ) {
    const filter: Record<string, any> = {
      isAvailable: true,
    };

    if (restaurantId) {
      if (!Types.ObjectId.isValid(restaurantId)) {
        throw new BadRequestException(
          'Identifiant du restaurant invalide.',
        );
      }

      filter.restaurantId = new Types.ObjectId(restaurantId);
    }

    if (category?.trim()) {
      filter.category = new RegExp(
        this.escapeRegex(category.trim()),
        'i',
      );
    }

    if (search?.trim()) {
      filter.name = new RegExp(
        this.escapeRegex(search.trim()),
        'i',
      );
    }

    const products = await this.productModel
      .find(filter)
      .populate({
        path: 'restaurantId',
        select: 'name logoUrl address status isOpen',
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return products.filter((product: any) => {
      return (
        product.restaurantId &&
        product.restaurantId.status === RestaurantStatus.APPROVED
      );
    });
  }

  async findOne(productId: string) {
    const product = await this.findProductById(productId);

    const restaurant = await this.restaurantModel
      .findById(product.restaurantId)
      .select('name logoUrl address status isOpen')
      .lean()
      .exec();

    if (
      !restaurant ||
      restaurant.status !== RestaurantStatus.APPROVED ||
      !product.isAvailable
    ) {
      throw new NotFoundException('Plat introuvable.');
    }

    return {
      data: {
        ...product.toObject(),
        restaurantId: restaurant,
      },
    };
  }

  async update(
    productId: string,
    dto: UpdateProductDto,
    userId: string,
  ) {
    const product = await this.findProductById(productId);

    await this.findOwnedRestaurant(
      product.restaurantId.toString(),
      userId,
    );

    const updates: Record<string, any> = {};

    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.description !== undefined) {
      updates.description = dto.description.trim();
    }
    if (dto.price !== undefined) updates.price = dto.price;
    if (dto.category !== undefined) {
      updates.category = dto.category.trim();
    }
    if (dto.imageUrl !== undefined) {
      updates.imageUrl = dto.imageUrl.trim();
    }
    if (dto.imagePublicId !== undefined) {
      updates.imagePublicId = dto.imagePublicId;
    }

    const updatedProduct = await this.productModel
      .findByIdAndUpdate(
        productId,
        { $set: updates },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    return {
      message: 'Plat modifié avec succès.',
      data: updatedProduct,
    };
  }

  async updateAvailability(
    productId: string,
    isAvailable: boolean,
    userId: string,
  ) {
    if (typeof isAvailable !== 'boolean') {
      throw new BadRequestException(
        'Le champ isAvailable doit être un booléen.',
      );
    }

    const product = await this.findProductById(productId);

    await this.findOwnedRestaurant(
      product.restaurantId.toString(),
      userId,
    );

    product.isAvailable = isAvailable;
    await product.save();

    return {
      message: isAvailable
        ? 'Plat rendu disponible.'
        : 'Plat rendu indisponible.',
      data: product,
    };
  }

  async remove(productId: string, userId: string) {
    const product = await this.findProductById(productId);

    await this.findOwnedRestaurant(
      product.restaurantId.toString(),
      userId,
    );

    await product.deleteOne();

    return {
      message: 'Plat supprimé avec succès.',
    };
  }

  /**
   * Vérifie si le restaurant possède encore un abonnement valide.
   */
  private async ensureSubscriptionActive(
    restaurant: RestaurantDocument,
  ): Promise<void> {
    const now = new Date();

    // Période d'essai gratuite de 10 jours.
    if (
      restaurant.subscriptionStatus === SubscriptionStatus.TRIAL
    ) {
      if (
        restaurant.trialEndsAt &&
        new Date(restaurant.trialEndsAt) > now
      ) {
        return;
      }

      restaurant.subscriptionStatus = SubscriptionStatus.EXPIRED;
      await restaurant.save();

      throw new ForbiddenException(
        'Votre période d’essai est terminée. Veuillez renouveler votre abonnement pour ajouter de nouveaux plats.',
      );
    }

    // Abonnement payant.
    if (
      restaurant.subscriptionStatus === SubscriptionStatus.ACTIVE
    ) {
      if (
        restaurant.subscriptionExpiresAt &&
        new Date(restaurant.subscriptionExpiresAt) > now
      ) {
        return;
      }

      restaurant.subscriptionStatus = SubscriptionStatus.EXPIRED;
      await restaurant.save();

      throw new ForbiddenException(
        'Votre abonnement a expiré. Veuillez le renouveler pour ajouter de nouveaux plats.',
      );
    }

    // NOT_STARTED, EXPIRED ou PENDING_PAYMENT.
    throw new ForbiddenException(
      'Votre abonnement ne permet pas actuellement d’ajouter des plats. Veuillez activer ou renouveler votre offre.',
    );
  }

  private async findProductById(
    productId: string,
  ): Promise<ProductDocument> {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException(
        'Identifiant du plat invalide.',
      );
    }

    const product = await this.productModel
      .findById(productId)
      .exec();

    if (!product) {
      throw new NotFoundException('Plat introuvable.');
    }

    return product;
  }

  private async findOwnedRestaurant(
    restaurantId: string,
    userId: string,
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

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez gérer que les plats de votre restaurant.',
      );
    }

    return restaurant;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
