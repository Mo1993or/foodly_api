
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Order,
  OrderDocument,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './schemas/order.schema';

import {
  Product,
  ProductDocument,
} from '../products/schemas/product.schema';

import {
  Restaurant,
  RestaurantDocument,
  RestaurantStatus,
  SubscriptionStatus,
} from '../restaurants/schemas/restaurant.schema';

import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,

    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
  ) {}

  /**
   * Création publique d'une commande.
   * Le panier peut contenir des produits de plusieurs restaurants.
   * Une commande distincte est créée pour chaque restaurant.
   */
  async create(dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'Une commande doit contenir au moins un produit.',
      );
    }

    for (const item of dto.items) {
      if (!Types.ObjectId.isValid(item.productId)) {
        throw new BadRequestException(
          'Identifiant de produit invalide.',
        );
      }

      if (!Types.ObjectId.isValid(item.restaurantId)) {
        throw new BadRequestException(
          'Identifiant de restaurant invalide.',
        );
      }

      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new BadRequestException(
          'La quantité doit être un entier supérieur à zéro.',
        );
      }
    }

    const productIds = dto.items.map((item) => item.productId);

    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Un même produit ne peut pas apparaître plusieurs fois dans le panier.',
      );
    }

    const groupedItems = new Map<string, typeof dto.items>();

    for (const item of dto.items) {
      const restaurantId = item.restaurantId;

      if (!groupedItems.has(restaurantId)) {
        groupedItems.set(restaurantId, []);
      }

      groupedItems.get(restaurantId)!.push(item);
    }

    const restaurantIds = [...groupedItems.keys()];

    const restaurants = await this.restaurantModel
      .find({
        _id: {
          $in: restaurantIds.map(
            (id) => new Types.ObjectId(id),
          ),
        },
      })
      .exec();

    if (restaurants.length !== restaurantIds.length) {
      throw new NotFoundException(
        'Un ou plusieurs restaurants sont introuvables.',
      );
    }

    const restaurantMap = new Map(
      restaurants.map((restaurant) => [
        restaurant._id.toString(),
        restaurant,
      ]),
    );

    // Vérifier chaque restaurant avant de créer les commandes.
    for (const restaurantId of restaurantIds) {
      const restaurant = restaurantMap.get(restaurantId);

      if (!restaurant) {
        throw new NotFoundException(
          'Restaurant introuvable.',
        );
      }

      if (restaurant.status !== RestaurantStatus.APPROVED) {
        throw new ForbiddenException(
          `Le restaurant ${restaurant.name} ne peut pas recevoir de commandes.`,
        );
      }

      if (!restaurant.isOpen) {
        throw new ForbiddenException(
          `Le restaurant ${restaurant.name} est actuellement fermé.`,
        );
      }

      await this.ensureSubscriptionIsValid(restaurant);
    }

    const products = await this.productModel
      .find({
        _id: {
          $in: productIds.map(
            (id) => new Types.ObjectId(id),
          ),
        },
        isAvailable: true,
      })
      .exec();

    if (products.length !== dto.items.length) {
      throw new BadRequestException(
        'Un ou plusieurs produits sont introuvables ou indisponibles.',
      );
    }

    const productMap = new Map(
      products.map((product) => [
        product._id.toString(),
        product,
      ]),
    );

    for (const item of dto.items) {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new BadRequestException(
          'Un produit de la commande est introuvable.',
        );
      }

      if (
        product.restaurantId.toString() !== item.restaurantId
      ) {
        throw new BadRequestException(
          `Le produit ${product.name} n'appartient pas au restaurant indiqué.`,
        );
      }
    }

    const ordersToCreate = [];

    for (const [restaurantId, items] of groupedItems.entries()) {
      const restaurant = restaurantMap.get(restaurantId)!;

      const orderItems = items.map((item) => {
        const product = productMap.get(item.productId)!;

        return {
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          imageUrl: product.imageUrl,
        };
      });

      const total = orderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      ordersToCreate.push({
        restaurantId: restaurant._id,
        customer: {
          name: dto.customer.name.trim(),
          phone: dto.customer.phone.trim(),
          address: dto.customer.address.trim(),
        },
        items: orderItems,
        total,
        note: dto.note?.trim() ?? '',
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        paymentStatus: PaymentStatus.PENDING,
        status: OrderStatus.PENDING,
      });
    }

    const createdOrders = await this.orderModel.insertMany(
      ordersToCreate,
      { ordered: true },
    );

    return {
      message: `${createdOrders.length} commande(s) enregistrée(s) avec succès.`,
      count: createdOrders.length,
      data: createdOrders,
    };
  }

  /**
   * Vérifie que l'essai gratuit ou l'abonnement payant
   * est encore valide pour recevoir de nouvelles commandes.
   */
  private async ensureSubscriptionIsValid(
    restaurant: RestaurantDocument,
  ): Promise<void> {
    const now = new Date();

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
        `La période d'essai du restaurant ${restaurant.name} est terminée. Il doit choisir une offre payante pour recevoir de nouvelles commandes.`,
      );
    }

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
        `L'abonnement du restaurant ${restaurant.name} a expiré. Il doit renouveler son offre pour recevoir de nouvelles commandes.`,
      );
    }

    throw new ForbiddenException(
      `Le restaurant ${restaurant.name} ne dispose pas d'un abonnement actif pour recevoir de nouvelles commandes.`,
    );
  }

  /**
   * Liste des commandes du restaurant connecté.
   * Accessible même après expiration.
   */
  async findByRestaurant(
    restaurantId: string,
    userId: string,
  ) {
    await this.findOwnedRestaurant(restaurantId, userId);

    const orders = await this.orderModel
      .find({
        restaurantId: new Types.ObjectId(restaurantId),
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      data: orders,
    };
  }

  /**
   * Détail d'une ancienne ou nouvelle commande.
   */
  async findOneForRestaurant(
    orderId: string,
    userId: string,
  ) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException(
        'Identifiant de commande invalide.',
      );
    }

    const order = await this.orderModel
      .findById(orderId)
      .exec();

    if (!order) {
      throw new NotFoundException('Commande introuvable.');
    }

    await this.findOwnedRestaurant(
      order.restaurantId.toString(),
      userId,
    );

    return {
      data: order,
    };
  }

  /**
   * Vérifie que le restaurant appartient au restaurateur connecté.
   */
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
        'Vous ne pouvez consulter que les commandes de votre restaurant.',
      );
    }

    return restaurant;
  }

  /**
   * Mise à jour du statut d'une commande.
   * Reste autorisée même après expiration.
   */
  async updateStatus(
    orderId: string,
    userId: string,
    newStatus: OrderStatus,
  ) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException(
        'Identifiant de commande invalide.',
      );
    }

    const order = await this.orderModel
      .findById(orderId)
      .exec();

    if (!order) {
      throw new NotFoundException(
        'Commande introuvable.',
      );
    }

    await this.findOwnedRestaurant(
      order.restaurantId.toString(),
      userId,
    );

    const allowedTransitions: Record<
      OrderStatus,
      OrderStatus[]
    > = {
      [OrderStatus.PENDING]: [
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CONFIRMED]: [
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PREPARING]: [
        OrderStatus.READY,
      ],
      [OrderStatus.READY]: [
        OrderStatus.DELIVERED,
      ],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    if (!allowedTransitions[order.status].includes(newStatus)) {
      throw new BadRequestException(
        `Impossible de passer de ${order.status} à ${newStatus}.`,
      );
    }

    order.status = newStatus;

    await order.save();

    return {
      message: 'Statut de la commande mis à jour avec succès.',
      data: order,
    };
  }
}
