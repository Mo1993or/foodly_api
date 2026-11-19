
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,

    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,

    private readonly notificationsService: NotificationsService,
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

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
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
          $in: restaurantIds.map((id) => new Types.ObjectId(id)),
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

    for (const restaurantId of restaurantIds) {
      const restaurant = restaurantMap.get(restaurantId);

      if (!restaurant) {
        throw new NotFoundException('Restaurant introuvable.');
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
          $in: productIds.map((id) => new Types.ObjectId(id)),
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

      if (product.restaurantId.toString() !== item.restaurantId) {
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

        // Token FCM du client associé à chaque commande créée
        customerFcmToken:
          dto.customerFcmToken?.trim() || null,

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

// Notifications des restaurateurs concernés.
// Chaque commande appartient à un seul restaurant.
for (const order of createdOrders) {
  const restaurant = restaurantMap.get(
    order.restaurantId.toString(),
  );

  if (!restaurant) {
    continue;
  }

  try {
    await this.notificationsService.sendToUser(
      restaurant.ownerId.toString(),
      'Nouvelle commande reçue',
      `Vous avez reçu une nouvelle commande de ${order.total} FCFA.`,
      {
        type: 'NEW_ORDER',
        orderId: order._id.toString(),
        restaurantId: restaurant._id.toString(),
        total: order.total.toString(),
        status: OrderStatus.PENDING,
      },
    );
  } catch (error) {
    this.logger.warn(
      `La commande ${order._id} a été enregistrée, mais la notification du restaurateur n'a pas pu être envoyée : ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

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

    if (restaurant.subscriptionStatus === SubscriptionStatus.TRIAL) {
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

    if (restaurant.subscriptionStatus === SubscriptionStatus.ACTIVE) {
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
   * Tableau de bord du restaurateur.
   * Les données sont calculées uniquement pour son restaurant.
   */
  async getRestaurantDashboard(
    restaurantId: string,
    userId: string,
  ) {
    await this.findOwnedRestaurant(restaurantId, userId);

    const restaurantObjectId = new Types.ObjectId(restaurantId);

    const restaurantFilter = {
      restaurantId: restaurantObjectId,
    };

    const activeStatuses = [
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const firstDay = new Date(today);
    firstDay.setUTCDate(firstDay.getUTCDate() - 6);

    const [
      totalOrders,
      pendingOrders,
      activeOrders,
      completedOrders,
      revenueResult,
      averageResult,
      weeklyResult,
      recentOrders,
    ] = await Promise.all([
      this.orderModel.countDocuments(restaurantFilter).exec(),

      this.orderModel
        .countDocuments({
          ...restaurantFilter,
          status: OrderStatus.PENDING,
        })
        .exec(),

      this.orderModel
        .countDocuments({
          ...restaurantFilter,
          status: { $in: activeStatuses },
        })
        .exec(),

      this.orderModel
        .countDocuments({
          ...restaurantFilter,
          status: OrderStatus.DELIVERED,
        })
        .exec(),

      this.orderModel.aggregate([
        {
          $match: {
            ...restaurantFilter,
            status: OrderStatus.DELIVERED,
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
          },
        },
      ]),

      this.orderModel.aggregate([
        {
          $match: {
            ...restaurantFilter,
            status: { $ne: OrderStatus.CANCELLED },
          },
        },
        {
          $group: {
            _id: null,
            averageBasket: { $avg: '$total' },
          },
        },
      ]),

      this.orderModel.aggregate([
        {
          $match: {
            ...restaurantFilter,
            status: OrderStatus.DELIVERED,
            createdAt: { $gte: firstDay },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'Africa/Dakar',
              },
            },
            revenue: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      this.orderModel
        .find(restaurantFilter)
        .sort({ createdAt: -1 })
        .limit(4)
        .select(
          '_id customer.name customer.phone total status createdAt',
        )
        .lean()
        .exec(),
    ]);

    const totalRevenue = revenueResult[0]?.totalRevenue ?? 0;
    const averageBasket = averageResult[0]?.averageBasket ?? 0;

    const weeklyRevenueMap = new Map<string, number>(
      weeklyResult.map((item: { _id: string; revenue: number }) => [
        item._id,
        item.revenue,
      ]),
    );

    const dayLabels = [
      'Dim',
      'Lun',
      'Mar',
      'Mer',
      'Jeu',
      'Ven',
      'Sam',
    ];

    const weeklyRevenue = [];

    for (let index = 0; index < 7; index++) {
      const date = new Date(firstDay);
      date.setUTCDate(firstDay.getUTCDate() + index);

      const dateKey = date.toISOString().slice(0, 10);

      weeklyRevenue.push({
        date: dateKey,
        day: dayLabels[date.getUTCDay()],
        revenue: weeklyRevenueMap.get(dateKey) ?? 0,
      });
    }

    return {
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        activeOrders,
        completedOrders,
        totalRevenue,
        averageBasket: Math.round(averageBasket),
        weeklyRevenue,
        orderDistribution: {
          pending: pendingOrders,
          active: activeOrders,
          completed: completedOrders,
        },
        recentOrders,
      },
    };
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

    const order = await this.orderModel.findById(orderId).exec();

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
   * Construit le contenu de la notification selon le statut.
   */
  private getStatusNotification(status: OrderStatus): {
    title: string;
    body: string;
  } {
    switch (status) {
      case OrderStatus.CONFIRMED:
        return {
          title: 'Commande confirmée',
          body: 'Votre commande a été confirmée par le restaurant.',
        };

      case OrderStatus.PREPARING:
        return {
          title: 'Commande en préparation',
          body: 'Le restaurant prépare actuellement votre commande.',
        };

      case OrderStatus.READY:
        return {
          title: 'Commande prête',
          body: 'Votre commande est prête.',
        };

      case OrderStatus.DELIVERED:
        return {
          title: 'Commande livrée',
          body: 'Votre commande a été livrée. Bon appétit !',
        };

      case OrderStatus.CANCELLED:
        return {
          title: 'Commande annulée',
          body: 'Votre commande a été annulée par le restaurant.',
        };

      default:
        return {
          title: 'Mise à jour de votre commande',
          body: 'Le statut de votre commande a été mis à jour.',
        };
    }
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

    const order = await this.orderModel.findById(orderId).exec();

    if (!order) {
      throw new NotFoundException('Commande introuvable.');
    }

    await this.findOwnedRestaurant(
      order.restaurantId.toString(),
      userId,
    );

    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CONFIRMED]: [
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PREPARING]: [OrderStatus.READY],
      [OrderStatus.READY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    if (!allowedTransitions[order.status].includes(newStatus)) {
      throw new BadRequestException(
        `Impossible de passer de ${order.status} à ${newStatus}.`,
      );
    }

    order.status = newStatus;

    // La commande est d'abord enregistrée en base.
    await order.save();

    // La notification est envoyée après l'enregistrement.
    // Une erreur Firebase ne doit jamais annuler la mise à jour.
    if (order.customerFcmToken) {
      const notification = this.getStatusNotification(newStatus);

      try {
        await this.notificationsService.sendToToken(
          order.customerFcmToken,
          notification.title,
          notification.body,
          {
            type: 'ORDER_STATUS_UPDATE',
            orderId: order._id.toString(),
            status: newStatus,
          },
        );
      } catch (error) {
        this.logger.warn(
          `La commande ${order._id} a été mise à jour, mais la notification client n'a pas pu être envoyée : ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      message: 'Statut de la commande mis à jour avec succès.',
      data: order,
    };
  }
}
