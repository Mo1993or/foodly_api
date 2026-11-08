
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../common/guards/jwt-auth.guard';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

import { UserRole } from '../users/shemas/user.shema';

import { SubscriptionsService } from './subscriptions.service';

import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { RejectSubscriptionDto } from './dto/reject-subscription.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Restaurateur :
   * Choisir une offre et créer une demande d'abonnement.
   *
   * FREE : activation immédiate de l'essai de 10 jours.
   * STARTER / PRO / PREMIUM : demande de paiement Wave.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  createRequest(
    @Body() dto: CreateSubscriptionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.subscriptionsService.createRequest(
      dto.restaurantId,
      dto.offerId,
      request.user.sub,
    );
  }

  /**
   * Restaurateur :
   * Déclarer son paiement Wave.
   */
  @Patch(':id/payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  submitPayment(
    @Param('id') subscriptionId: string,
    @Body() dto: SubmitPaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.subscriptionsService.submitPayment(
      subscriptionId,
      request.user.sub,
      dto.paymentReference,
    );
  }

  /**
   * Restaurateur :
   * Consulter l'historique des abonnements de son restaurant.
   */
  @Get('my/:restaurantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  findMySubscriptions(
    @Param('restaurantId') restaurantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.subscriptionsService.findByRestaurant(
      restaurantId,
      request.user.sub,
    );
  }

  /**
   * Super Admin :
   * Consulter toutes les demandes d'abonnement.
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findAllAdmin() {
    return this.subscriptionsService.findAllAdmin();
  }

  /**
   * Super Admin :
   * Activer un abonnement après vérification du paiement.
   */
  @Patch('admin/:id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  activate(
    @Param('id') subscriptionId: string,
    @Body() dto: ActivateSubscriptionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.subscriptionsService.activate(
      subscriptionId,
      request.user.sub,
      dto,
    );
  }

  /**
   * Super Admin :
   * Rejeter une demande après vérification.
   */
  @Patch('admin/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  reject(
    @Param('id') subscriptionId: string,
    @Body() dto: RejectSubscriptionDto,
  ) {
    return this.subscriptionsService.reject(
      subscriptionId,
      dto.reason,
    );
  }
}
