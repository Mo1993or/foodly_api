
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/shemas/user.shema';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
  ) {}

  // Créer une commande : accessible sans compte client.
  @Post('orders')
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  // Liste des commandes d'un restaurant.
  // Accessible uniquement à son restaurateur.
  @Get('restaurant/:restaurantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  findByRestaurant(
    @Param('restaurantId') restaurantId: string,
    @Req() request: any,
  ) {
    return this.ordersService.findByRestaurant(
      restaurantId,
      request.user.sub,
    );
  }

  // Détail d'une commande.
  // Le service vérifie que le restaurateur en est propriétaire.
  @Get('/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  findOne(
    @Param('id') id: string,
    @Req() request: any,
  ) {
    return this.ordersService.findOneForRestaurant(
      id,
      request.user.sub,
    );
  };
    @Patch(':id/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.RESTAURATEUR)
    updateStatus(
    @Param('id') id: string,
    @Req() request: any,
    @Body() dto: UpdateOrderStatusDto,
    ) {
    return this.ordersService.updateStatus(
        id,
        request.user.sub,
        dto.status,
    );
    }
}
