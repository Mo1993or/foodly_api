
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Subscription,
  SubscriptionDocument,
  SubscriptionRequestStatus,
} from './schemas/subscription.schema';

import {
  Offer,
  OfferBillingPeriod,
  OfferCode,
} from '../offers/schemas/offer.schema';

import {
  Restaurant,
  RestaurantStatus,
  SubscriptionStatus,
} from '../restaurants/schemas/restaurant.schema';

import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,

    @InjectModel(Offer.name)
    private readonly offerModel: Model<Offer>,

    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<Restaurant>,
  ) {}

  /**
   * Création d'une demande d'abonnement par un restaurateur.
   */
  async createRequest(
    restaurantId: string,
    offerId: string,
    userId: string,
  ) {
    if (
      !Types.ObjectId.isValid(restaurantId) ||
      !Types.ObjectId.isValid(offerId)
    ) {
      throw new BadRequestException('Identifiant invalide.');
    }

    const restaurant = await this.restaurantModel.findById(restaurantId);

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas gérer cet abonnement.',
      );
    }

    if (restaurant.status !== RestaurantStatus.APPROVED) {
      throw new ForbiddenException(
        'Votre restaurant doit être approuvé avant de souscrire.',
      );
    }

    const offer = await this.offerModel.findOne({
      _id: offerId,
      isActive: true,
    });

    if (!offer) {
      throw new NotFoundException('Offre introuvable ou inactive.');
    }

    if (
      offer.code === OfferCode.FREE ||
      offer.price <= 0 ||
      offer.billingPeriod !== OfferBillingPeriod.MONTHLY
    ) {
      throw new BadRequestException(
        'Cette offre ne peut pas faire l’objet d’un abonnement payant.',
      );
    }

    const existingRequest = await this.subscriptionModel.findOne({
      restaurantId: restaurant._id,
      status: {
        $in: [
          SubscriptionRequestStatus.PENDING_PAYMENT,
          SubscriptionRequestStatus.PENDING_VERIFICATION,
        ],
      },
    });

    if (existingRequest) {
      throw new BadRequestException(
        'Une demande d’abonnement est déjà en cours.',
      );
    }

    const subscription = await this.subscriptionModel.create({
      restaurantId: restaurant._id,
      offerId: offer._id,
      offerCode: offer.code,
      offerName: offer.name,
      amount: offer.price,
      paymentMethod: 'wave',
      paymentReference: '',
      status: SubscriptionRequestStatus.PENDING_PAYMENT,
    });

    return {
      message: 'Demande d’abonnement créée.',
      subscription,
    };
  }

  /**
   * Déclaration du paiement Wave par le restaurateur.
   * Le paiement sera ensuite vérifié manuellement par le Super Admin.
   */
  async submitPayment(
    subscriptionId: string,
    userId: string,
    paymentReference: string,
  ) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new BadRequestException('Identifiant invalide.');
    }

    const reference = paymentReference?.trim();

    if (!reference) {
      throw new BadRequestException(
        'La référence du paiement est obligatoire.',
      );
    }

    const subscription = await this.subscriptionModel.findById(
      subscriptionId,
    );

    if (!subscription) {
      throw new NotFoundException('Demande d’abonnement introuvable.');
    }

    const restaurant = await this.restaurantModel.findById(
      subscription.restaurantId,
    );

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier cette demande.',
      );
    }

    if (
      subscription.status !== SubscriptionRequestStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Cette demande ne peut plus recevoir de déclaration de paiement.',
      );
    }

    subscription.paymentReference = reference;
    subscription.status =
      SubscriptionRequestStatus.PENDING_VERIFICATION;

    await subscription.save();

    return {
      message: 'Paiement déclaré. En attente de vérification.',
      subscription,
    };
  }

  /**
   * Liste des demandes pour le tableau de bord Super Admin.
   */
  async findAllAdmin() {
    return this.subscriptionModel
      .find()
      .populate('restaurantId')
      .populate('validatedBy')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Activation manuelle après vérification du paiement par le Super Admin.
   */
  async activate(
    subscriptionId: string,
    adminId: string,
    dto: ActivateSubscriptionDto,
  ) {
    if (
      !Types.ObjectId.isValid(subscriptionId) ||
      !Types.ObjectId.isValid(adminId)
    ) {
      throw new BadRequestException('Identifiant invalide.');
    }

    const subscription = await this.subscriptionModel.findById(
      subscriptionId,
    );

    if (!subscription) {
      throw new NotFoundException('Demande d’abonnement introuvable.');
    }

    if (
      subscription.status !==
      SubscriptionRequestStatus.PENDING_VERIFICATION
    ) {
      throw new BadRequestException(
        'Cette demande n’est pas en attente de vérification.',
      );
    }

    if (
      subscription.paymentReference !==
      dto.paymentReference?.trim()
    ) {
      throw new BadRequestException(
        'La référence du paiement ne correspond pas.',
      );
    }

    const restaurant = await this.restaurantModel.findById(
      subscription.restaurantId,
    );

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    if (restaurant.status !== RestaurantStatus.APPROVED) {
      throw new BadRequestException(
        'Le restaurant doit être approuvé pour activer un abonnement.',
      );
    }

    if (subscription.amount <= 0) {
      throw new BadRequestException('Montant de l’abonnement invalide.');
    }

    const now = new Date();

    // Si le restaurant possède déjà un abonnement payant actif,
    // le renouvellement commence à la date de son expiration.
    // Sinon, le nouvel abonnement commence immédiatement.
    let startsAt = now;

    if (
      restaurant.subscriptionStatus === SubscriptionStatus.ACTIVE &&
      restaurant.subscriptionExpiresAt &&
      restaurant.subscriptionExpiresAt > now
    ) {
      startsAt = new Date(restaurant.subscriptionExpiresAt);
    }

    const expiresAt = this.addOneMonth(startsAt);

    // Mise à jour du restaurant.
    restaurant.activeOffer = subscription.offerName;
    restaurant.subscriptionStatus = SubscriptionStatus.ACTIVE;
    restaurant.subscriptionExpiresAt = expiresAt;

    await restaurant.save();

    // Mise à jour de l'historique de l'abonnement.
    subscription.status = SubscriptionRequestStatus.ACTIVE;
    subscription.startsAt = startsAt;
    subscription.expiresAt = expiresAt;
    subscription.validatedBy = new Types.ObjectId(adminId);
    subscription.validatedAt = now;
    subscription.rejectionReason = '';

    await subscription.save();

    return {
      message: 'Abonnement activé avec succès.',
      restaurant,
      subscription,
    };
  }

  /**
   * Rejet d'une demande après vérification.
   */
  async reject(subscriptionId: string, reason: string) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new BadRequestException('Identifiant invalide.');
    }

    const subscription = await this.subscriptionModel.findById(
      subscriptionId,
    );

    if (!subscription) {
      throw new NotFoundException('Demande d’abonnement introuvable.');
    }

    if (
      subscription.status !==
      SubscriptionRequestStatus.PENDING_VERIFICATION
    ) {
      throw new BadRequestException(
        'Cette demande ne peut pas être rejetée.',
      );
    }

    const rejectionReason = reason?.trim();

    if (!rejectionReason) {
      throw new BadRequestException(
        'Le motif du rejet est obligatoire.',
      );
    }

    subscription.status = SubscriptionRequestStatus.REJECTED;
    subscription.rejectionReason = rejectionReason;

    await subscription.save();

    return {
      message: 'Demande d’abonnement rejetée.',
      subscription,
    };
  }

  /**
   * Historique des abonnements d'un restaurant.
   */
  async findByRestaurant(restaurantId: string, userId: string) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Identifiant invalide.');
    }

    const restaurant = await this.restaurantModel.findById(restaurantId);

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas consulter cet historique.',
      );
    }

    return this.subscriptionModel
      .find({ restaurantId: restaurant._id })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Ajoute un mois calendaire en évitant les débordements de fin de mois.
   */
  private addOneMonth(date: Date): Date {
    const result = new Date(date);
    const originalDay = result.getDate();

    result.setDate(1);
    result.setMonth(result.getMonth() + 1);

    const lastDayOfMonth = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
    ).getDate();

    result.setDate(Math.min(originalDay, lastDayOfMonth));

    return result;
  }
}
