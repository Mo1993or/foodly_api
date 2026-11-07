
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
   * Restaurateur : créer une demande d'abonnement.
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
   * Restaurateur : déclarer son paiement Wave.
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
   * Restaurateur : consulter l'historique de son restaurant.
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
   * Super Admin : consulter toutes les demandes.
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findAllAdmin() {
    return this.subscriptionsService.findAllAdmin();
  }

  /**
   * Super Admin : activer un abonnement après vérification du paiement.
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
   * Super Admin : rejeter une demande.
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
