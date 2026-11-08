
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Subscription,
  SubscriptionRequestStatus,
  SubscriptionPaymentMethod,
} from './schemas/subscription.schema';

import {
  Offer,
  OfferCode,
  OfferBillingPeriod,
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
    private readonly subscriptionModel: Model<Subscription>,

    @InjectModel(Offer.name)
    private readonly offerModel: Model<Offer>,

    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<Restaurant>,
  ) {}

  /**
   * Création d'une demande d'abonnement.
   *
   * FREE :
   * - Activation immédiate.
   * - 10 jours d'essai.
   * - Une seule utilisation par restaurant.
   *
   * Offres payantes :
   * - Création d'une demande de paiement Wave.
   * - Activation uniquement après validation du Super Admin.
   */
  async createRequest(
    restaurantId: string,
    offerId: string,
    userId: string,
  ) {
    this.validateObjectId(restaurantId, 'Restaurant');
    this.validateObjectId(offerId, 'Offre');
    this.validateObjectId(userId, 'Utilisateur');

    const restaurant = await this.restaurantModel.findById(restaurantId);

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas gérer l’abonnement de ce restaurant.',
      );
    }

    if (restaurant.status !== RestaurantStatus.APPROVED) {
      throw new BadRequestException(
        'Le restaurant doit être approuvé avant de souscrire à une offre.',
      );
    }

    const offer = await this.offerModel.findOne({
      _id: offerId,
      isActive: true,
    });

    if (!offer) {
      throw new NotFoundException('Offre introuvable ou inactive.');
    }

    const now = new Date();

    // --------------------------------------------------
    // OFFRE FREE
    // --------------------------------------------------

    if (offer.code === OfferCode.FREE) {
      if (
        Number(offer.price) !== 0 ||
        offer.billingPeriod !== OfferBillingPeriod.NONE
      ) {
        throw new BadRequestException(
          'La configuration de l’offre FREE est incorrecte.',
        );
      }

      // Vérification de l'existence d'un ancien essai.
      const existingTrial = await this.subscriptionModel.findOne({
        restaurantId: restaurant._id,
        offerCode: OfferCode.FREE,
        isTrial: true,
      });

      if (existingTrial) {
        throw new ConflictException(
          'Ce restaurant a déjà utilisé son essai gratuit.',
        );
      }

      // Une demande payante doit être traitée avant
      // de pouvoir créer une autre demande.
      const pendingRequest = await this.subscriptionModel.findOne({
        restaurantId: restaurant._id,
        status: {
          $in: [
            SubscriptionRequestStatus.PENDING_PAYMENT,
            SubscriptionRequestStatus.PENDING_VERIFICATION,
          ],
        },
      });

      if (pendingRequest) {
        throw new ConflictException(
          'Une demande d’abonnement est déjà en cours.',
        );
      }

      const trialEndsAt = this.addTenDays(now);

      try {
        const subscription = await this.subscriptionModel.create({
          restaurantId: restaurant._id,
          offerId: offer._id,
          offerCode: OfferCode.FREE,
          offerName: offer.name,
          amount: 0,
          isTrial: true,
          paymentMethod: SubscriptionPaymentMethod.NONE,
          paymentReference: '',
          status: SubscriptionRequestStatus.ACTIVE,
          startsAt: now,
          expiresAt: trialEndsAt,
          validatedBy: null,
          validatedAt: null,
          rejectionReason: '',
        });

        restaurant.activeOffer = OfferCode.FREE;
        restaurant.subscriptionStatus = SubscriptionStatus.TRIAL;
        restaurant.trialStartedAt = now;
        restaurant.trialEndsAt = trialEndsAt;
        restaurant.subscriptionExpiresAt = null;

        await restaurant.save();

        return {
          message: 'Votre essai gratuit de 10 jours est activé.',
          subscription,
        };
      } catch (error) {
        // Protection supplémentaire contre les demandes simultanées.
        if (error?.code === 11000) {
          throw new ConflictException(
            'Ce restaurant a déjà utilisé son essai gratuit.',
          );
        }

        throw error;
      }
    }

    // --------------------------------------------------
    // OFFRES PAYANTES
    // --------------------------------------------------

    if (
      Number(offer.price) <= 0 ||
      offer.billingPeriod !== OfferBillingPeriod.MONTHLY
    ) {
      throw new BadRequestException(
        'Cette offre payante possède une configuration invalide.',
      );
    }

    const pendingRequest = await this.subscriptionModel.findOne({
      restaurantId: restaurant._id,
      status: {
        $in: [
          SubscriptionRequestStatus.PENDING_PAYMENT,
          SubscriptionRequestStatus.PENDING_VERIFICATION,
        ],
      },
    });

    if (pendingRequest) {
      throw new ConflictException(
        'Une demande de paiement est déjà en cours pour ce restaurant.',
      );
    }

    const subscription = await this.subscriptionModel.create({
      restaurantId: restaurant._id,
      offerId: offer._id,
      offerCode: offer.code,
      offerName: offer.name,
      amount: offer.price,
      isTrial: false,
      paymentMethod: SubscriptionPaymentMethod.WAVE,
      paymentReference: '',
      status: SubscriptionRequestStatus.PENDING_PAYMENT,
      startsAt: null,
      expiresAt: null,
      validatedBy: null,
      validatedAt: null,
      rejectionReason: '',
    });

    return {
      message:
        'Demande créée. Effectuez le paiement Wave puis soumettez votre référence.',
      subscription,
    };
  }

  /**
   * Soumission de la référence de paiement Wave.
   */
  async submitPayment(
    subscriptionId: string,
    userId: string,
    paymentReference: string,
  ) {
    this.validateObjectId(subscriptionId, 'Abonnement');
    this.validateObjectId(userId, 'Utilisateur');

    const reference = paymentReference?.trim();

    if (!reference) {
      throw new BadRequestException(
        'La référence de paiement est obligatoire.',
      );
    }

    if (reference.length > 150) {
      throw new BadRequestException(
        'La référence de paiement ne peut pas dépasser 150 caractères.',
      );
    }

    const subscription =
      await this.subscriptionModel.findById(subscriptionId);

    if (!subscription) {
      throw new NotFoundException('Demande d’abonnement introuvable.');
    }

    if (
      subscription.offerCode === OfferCode.FREE ||
      subscription.isTrial
    ) {
      throw new BadRequestException(
        'Aucun paiement n’est nécessaire pour l’offre FREE.',
      );
    }

    const restaurant = await this.restaurantModel.findById(
      subscription.restaurantId,
    );

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas soumettre le paiement de ce restaurant.',
      );
    }

    if (
      subscription.status !==
      SubscriptionRequestStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Cette demande ne peut plus recevoir de référence de paiement.',
      );
    }

    // Mise à jour conditionnelle pour éviter deux soumissions simultanées.
    const updatedSubscription =
      await this.subscriptionModel.findOneAndUpdate(
        {
          _id: subscriptionId,
          status: SubscriptionRequestStatus.PENDING_PAYMENT,
        },
        {
          $set: {
            paymentReference: reference,
            status: SubscriptionRequestStatus.PENDING_VERIFICATION,
          },
        },
        {
          new: true,
        },
      );

    if (!updatedSubscription) {
      throw new ConflictException(
        'Cette demande de paiement a déjà été modifiée.',
      );
    }

    return {
      message:
        'Référence envoyée. Votre paiement sera vérifié par le Super Admin.',
      subscription: updatedSubscription,
    };
  }

  /**
   * Liste de toutes les demandes pour le Super Admin.
   */
  async findAllAdmin() {
    return this.subscriptionModel
      .find()
      .populate('restaurantId')
      .populate('validatedBy')
      .sort({ createdAt: -1 });
  }

  /**
   * Activation d'un abonnement payant par le Super Admin.
   */
  async activate(
    subscriptionId: string,
    adminId: string,
    dto: ActivateSubscriptionDto,
  ) {
    this.validateObjectId(subscriptionId, 'Abonnement');
    this.validateObjectId(adminId, 'Administrateur');

    const subscription =
      await this.subscriptionModel.findById(subscriptionId);

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
      subscription.offerCode === OfferCode.FREE ||
      subscription.isTrial
    ) {
      throw new BadRequestException(
        'L’offre FREE ne nécessite pas de validation de paiement.',
      );
    }

    const expectedReference = subscription.paymentReference?.trim();
    const submittedReference = dto.paymentReference?.trim();

    if (!expectedReference) {
      throw new BadRequestException(
        'Aucune référence de paiement n’a été soumise.',
      );
    }

    if (expectedReference !== submittedReference) {
      throw new BadRequestException(
        'La référence de paiement ne correspond pas.',
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
        'Ce restaurant n’est pas approuvé.',
      );
    }

    const offer = await this.offerModel.findById(subscription.offerId);

    if (!offer || !offer.isActive) {
      throw new BadRequestException(
        'Cette offre est introuvable ou inactive.',
      );
    }

    if (
      offer.code === OfferCode.FREE ||
      offer.billingPeriod !== OfferBillingPeriod.MONTHLY ||
      Number(offer.price) <= 0
    ) {
      throw new BadRequestException(
        'Cette offre ne peut pas être activée comme abonnement payant.',
      );
    }

    // Vérification de la cohérence entre la demande et l'offre actuelle.
    if (
      offer.code !== subscription.offerCode ||
      Number(offer.price) !== Number(subscription.amount)
    ) {
      throw new BadRequestException(
        'Le prix ou le code de l’offre a changé depuis la demande. Vérification manuelle nécessaire.',
      );
    }

    const now = new Date();

    // Si un abonnement payant est encore actif,
    // le nouvel abonnement commence après son expiration.
    let startsAt = now;

    if (
      restaurant.subscriptionStatus === SubscriptionStatus.ACTIVE &&
      restaurant.subscriptionExpiresAt &&
      restaurant.subscriptionExpiresAt > now
    ) {
      startsAt = new Date(restaurant.subscriptionExpiresAt);
    }

    const expiresAt = this.addOneMonth(startsAt);

    /*
     * Verrouillage atomique de la demande.
     * Deux administrateurs ne peuvent pas activer simultanément
     * la même demande.
     */
    const activatedSubscription =
      await this.subscriptionModel.findOneAndUpdate(
        {
          _id: subscriptionId,
          status: SubscriptionRequestStatus.PENDING_VERIFICATION,
          offerCode: { $ne: OfferCode.FREE },
          isTrial: { $ne: true },
        },
        {
          $set: {
            status: SubscriptionRequestStatus.ACTIVE,
            startsAt,
            expiresAt,
            validatedBy: new Types.ObjectId(adminId),
            validatedAt: now,
            rejectionReason: '',
          },
        },
        {
          new: true,
        },
      );

    if (!activatedSubscription) {
      throw new ConflictException(
        'Cette demande a déjà été traitée par un autre administrateur.',
      );
    }

    try {
      restaurant.activeOffer = offer.code;
      restaurant.subscriptionStatus = SubscriptionStatus.ACTIVE;
      restaurant.trialStartedAt = null;
      restaurant.trialEndsAt = null;
      restaurant.subscriptionExpiresAt = expiresAt;

      await restaurant.save();
    } catch (error) {
      // Annulation de l'activation si la mise à jour du restaurant échoue.
      await this.subscriptionModel.updateOne(
        {
          _id: subscriptionId,
          status: SubscriptionRequestStatus.ACTIVE,
          validatedBy: new Types.ObjectId(adminId),
        },
        {
          $set: {
            status: SubscriptionRequestStatus.PENDING_VERIFICATION,
            startsAt: null,
            expiresAt: null,
            validatedBy: null,
            validatedAt: null,
          },
        },
      );

      throw error;
    }

    return {
      message: 'Abonnement activé avec succès.',
      subscription: activatedSubscription,
    };
  }

  /**
   * Refus d'une demande par le Super Admin.
   */
  async reject(subscriptionId: string, reason: string) {
    this.validateObjectId(subscriptionId, 'Abonnement');

    const rejectionReason = reason?.trim();

    if (!rejectionReason) {
      throw new BadRequestException(
        'Le motif du refus est obligatoire.',
      );
    }

    const subscription =
      await this.subscriptionModel.findById(subscriptionId);

    if (!subscription) {
      throw new NotFoundException('Demande d’abonnement introuvable.');
    }

    if (
      subscription.offerCode === OfferCode.FREE ||
      subscription.isTrial
    ) {
      throw new BadRequestException(
        'Une demande FREE ne peut pas être refusée comme paiement.',
      );
    }

    const rejectedSubscription =
      await this.subscriptionModel.findOneAndUpdate(
        {
          _id: subscriptionId,
          status: SubscriptionRequestStatus.PENDING_VERIFICATION,
        },
        {
          $set: {
            status: SubscriptionRequestStatus.REJECTED,
            rejectionReason,
          },
        },
        {
          new: true,
        },
      );

    if (!rejectedSubscription) {
      throw new ConflictException(
        'Cette demande a déjà été traitée.',
      );
    }

    return {
      message: 'Demande d’abonnement refusée.',
      subscription: rejectedSubscription,
    };
  }

  /**
   * Historique des abonnements d'un restaurant.
   */
  async findByRestaurant(
    restaurantId: string,
    userId: string,
  ) {
    this.validateObjectId(restaurantId, 'Restaurant');
    this.validateObjectId(userId, 'Utilisateur');

    const restaurant = await this.restaurantModel.findById(restaurantId);

    if (!restaurant) {
      throw new NotFoundException('Restaurant introuvable.');
    }

    if (restaurant.ownerId.toString() !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas consulter les abonnements de ce restaurant.',
      );
    }

    return this.subscriptionModel
      .find({ restaurantId: restaurant._id })
      .populate('offerId')
      .sort({ createdAt: -1 });
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  private validateObjectId(value: string, label: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${label} invalide.`);
    }
  }

  private addTenDays(date: Date): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + 10);
    return result;
  }

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
