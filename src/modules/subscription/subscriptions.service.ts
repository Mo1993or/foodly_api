
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
  OfferDocument,
  OfferCode,
  OfferBillingPeriod,
} from '../offers/schemas/offer.schema';

import {
  Restaurant,
  RestaurantDocument,
  RestaurantStatus,
  SubscriptionStatus,
} from '../restaurants/schemas/restaurant.schema';

import { UserRole } from '../users/shemas/user.shema';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';

@Injectable()
export class SubscriptionsService {
  [x: string]: any;
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,

    @InjectModel(Offer.name)
    private readonly offerModel: Model<OfferDocument>,

    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
  ) {}

  /**
   * Le restaurateur demande une souscription.
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
      throw new BadRequestException(
        'Identifiant du restaurant ou de l’offre invalide.',
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
        'Vous ne pouvez souscrire que pour votre propre restaurant.',
      );
    }

    if (restaurant.status !== RestaurantStatus.APPROVED) {
      throw new BadRequestException(
        'Le restaurant doit être approuvé avant de souscrire à une offre.',
      );
    }

    const offer = await this.offerModel
      .findOne({
        _id: offerId,
        isActive: true,
      })
      .exec();

    if (!offer) {
      throw new NotFoundException('Offre introuvable ou inactive.');
    }

    if (offer.code === OfferCode.FREE) {
      throw new BadRequestException(
        'L’offre Free est une période d’essai et ne peut pas être souscrite ici.',
      );
    }

    if (offer.price <= 0 || offer.billingPeriod !== OfferBillingPeriod.MONTHLY) {
      throw new BadRequestException(
        'Cette offre ne possède pas de tarif mensuel valide.',
      );
    }

    const existingRequest = await this.subscriptionModel
      .findOne({
        restaurantId: restaurant._id,
        status: {
          $in: [
            SubscriptionRequestStatus.PENDING_PAYMENT,
            SubscriptionRequestStatus.PENDING_VERIFICATION,
          ],
        },
      })
      .exec();

    if (existingRequest) {
      throw new BadRequestException(
        'Une demande de souscription est déjà en cours pour ce restaurant.',
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
      startsAt: null,
      expiresAt: null,
      validatedBy: null,
      validatedAt: null,
      rejectionReason: '',
    });

    return {
      message: 'Demande de souscription créée avec succès.',
      data: subscription,
    };
  }

  /**
   * Le restaurateur signale qu'il a effectué son paiement.
   */
  async submitPayment(
    subscriptionId: string,
    restaurantId: string,
    paymentReference: string,
  ) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new BadRequestException(
        'Identifiant de souscription invalide.',
      );
    }

    const reference = paymentReference?.trim();

    if (!reference) {
      throw new BadRequestException(
        'La référence du paiement est obligatoire.',
      );
    }

    const subscription = await this.subscriptionModel
      .findById(subscriptionId)
      .exec();

    if (!subscription) {
      throw new NotFoundException(
        'Souscription introuvable.',
      );
    }

    if (
      subscription.restaurantId.toString() !== restaurantId
    ) {
      throw new ForbiddenException(
        'Cette souscription ne vous appartient pas.',
      );
    }

    if (
      subscription.status !==
      SubscriptionRequestStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Cette souscription ne peut plus recevoir de paiement.',
      );
    }

    subscription.paymentReference = reference;
    subscription.status =
      SubscriptionRequestStatus.PENDING_VERIFICATION;

    await subscription.save();

    return {
      message: 'Paiement signalé. En attente de vérification.',
      data: subscription,
    };
  }

  /**
   * Liste des souscriptions réservée au Super Admin.
   */
  async findAllAdmin() {
    const subscriptions = await this.subscriptionModel
      .find()
      .populate({
        path: 'restaurantId',
        select: 'name ownerName ownerEmail phone',
      })
      .populate({
        path: 'validatedBy',
        select: 'name email',
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      count: subscriptions.length,
      data: subscriptions,
    };
  }

  /**
   * Validation manuelle du paiement par le Super Admin.
   */
  async activate(
    subscriptionId: string,
    adminId: string,
    dto: ActivateSubscriptionDto,
  ) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new BadRequestException(
        'Identifiant de souscription invalide.',
      );
    }

    if (!Types.ObjectId.isValid(adminId)) {
      throw new BadRequestException(
        'Identifiant administrateur invalide.',
      );
    }

    const subscription = await this.subscriptionModel
      .findById(subscriptionId)
      .exec();

    if (!subscription) {
      throw new NotFoundException(
        'Souscription introuvable.',
      );
    }

    if (
      subscription.status !==
      SubscriptionRequestStatus.PENDING_VERIFICATION
    ) {
      throw new BadRequestException(
        'Cette souscription est déjà traitée ou le paiement n’a pas été signalé.',
      );
    }

    if (
      !dto.paymentReference?.trim() ||
      dto.paymentReference.trim() !== subscription.paymentReference
    ) {
      throw new BadRequestException(
        'La référence du paiement ne correspond pas.',
      );
    }

    const restaurant = await this.restaurantModel
      .findById(subscription.restaurantId)
      .exec();

    if (!restaurant) {
      throw new NotFoundException(
        'Restaurant introuvable.',
      );
    }

    const offer = await this.offerModel
      .findById(subscription.offerId)
      .exec();

    if (!offer) {
      throw new NotFoundException(
        'Offre introuvable.',
      );
    }

    if (offer.code !== subscription.offerCode) {
      throw new BadRequestException(
        'Le code de l’offre ne correspond plus à la souscription.',
      );
    }

    if (offer.code === OfferCode.FREE) {
      throw new BadRequestException(
        'Une offre Free ne peut pas être activée comme abonnement payant.',
      );
    }

    if (offer.price !== subscription.amount) {
      throw new BadRequestException(
        'Le tarif de l’offre a changé. Vérification manuelle nécessaire.',
      );
    }

    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    // Activation de l'offre dans le restaurant.
    restaurant.activeOffer = subscription.offerName;
    restaurant.subscriptionStatus = SubscriptionStatus.ACTIVE;
    restaurant.subscriptionExpiresAt = expiresAt;

    await restaurant.save();

    // Enregistrement de la validation dans l'historique.
    subscription.status = SubscriptionRequestStatus.ACTIVE;
    subscription.startsAt = startsAt;
    subscription.expiresAt = expiresAt;
    subscription.validatedBy = new Types.ObjectId(adminId);
    subscription.validatedAt = startsAt;
    subscription.rejectionReason = '';

    await subscription.save();

    return {
      message: `Paiement validé. L'offre ${subscription.offerName} est maintenant active.`,
      data: {
        subscription,
        restaurant: {
          id: restaurant._id,
          name: restaurant.name,
          activeOffer: restaurant.activeOffer,
          subscriptionStatus: restaurant.subscriptionStatus,
          subscriptionExpiresAt:
            restaurant.subscriptionExpiresAt,
        },
      },
    };
  }

  /**
   * Refus d'une souscription par le Super Admin.
   */
  async reject(
    subscriptionId: string,
    reason: string,
  ) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new BadRequestException(
        'Identifiant de souscription invalide.',
      );
    }

    const subscription = await this.subscriptionModel
      .findById(subscriptionId)
      .exec();

    if (!subscription) {
      throw new NotFoundException(
        'Souscription introuvable.',
      );
    }

    if (
      subscription.status !==
      SubscriptionRequestStatus.PENDING_VERIFICATION
    ) {
      throw new BadRequestException(
        'Seules les demandes en attente de vérification peuvent être refusées.',
      );
    }

    const rejectionReason = reason?.trim();

    if (!rejectionReason) {
      throw new BadRequestException(
        'Le motif du refus est obligatoire.',
      );
    }

    subscription.status = SubscriptionRequestStatus.REJECTED;
    subscription.rejectionReason = rejectionReason;

    await subscription.save();

    return {
      message: 'La demande de souscription a été refusée.',
      data: subscription,
    };
  }

  /**
   * Historique des souscriptions d'un restaurant.
   */
  async findByRestaurant(
    restaurantId: string,
    userId: string,
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException(
        'Identifiant du restaurant invalide.',
      );
    }

    const restaurant = await this.restaurantModel
      .findById(restaurantId)
      .exec();

    if (!restaurant) {
      throw new NotFoundException(
        'Restaurant introuvable.',
      );
    }

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que vos propres souscriptions.',
      );
    }

    const subscriptions = await this.subscriptionModel
      .find({ restaurantId: restaurant._id })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      count: subscriptions.length,
      data: subscriptions,
    };
  }

  /**
   * Récupère le restaurant appartenant au restaurateur connecté.
   */
  async findRestaurantForOwner(userId: string) {
    const restaurant = await this.restaurantModel
      .findOne({
        ownerId: new Types.ObjectId(userId),
      })
      .exec();

    if (!restaurant) {
      throw new NotFoundException(
        'Aucun restaurant associé à ce compte.',
      );
    }

    return restaurant;
  }

}
