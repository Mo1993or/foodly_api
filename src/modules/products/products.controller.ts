import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/shemas/user.shema';

@Controller()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
  ) {}

  // Liste publique avec filtres facultatifs.
  @Get('products')
  findAll(
    @Query('restaurantId') restaurantId?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(
      restaurantId,
      category,
      search,
    );
  }

  // Plats d'un restaurant.
  @Get('restaurants/:restaurantId/products')
  findRestaurantProducts(
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.productsService.findAll(restaurantId);
  }

  // Détail d'un plat.
  @Get('products/:id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  // Ajouter un plat.
  @Post('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  create(
    @Body() dto: CreateProductDto,
    @Req() request: any,
  ) {
    return this.productsService.create(
      dto,
      request.user.sub,
    );
  }

  // Modifier un plat.
  @Patch('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() request: any,
  ) {
    return this.productsService.update(
      id,
      dto,
      request.user.sub,
    );
  }

  // Disponibilité d'un plat.
  @Patch('products/:id/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  updateAvailability(
    @Param('id') id: string,
    @Body('isAvailable') isAvailable: boolean,
    @Req() request: any,
  ) {
    return this.productsService.updateAvailability(
      id,
      isAvailable,
      request.user.sub,
    );
  }

  // Supprimer un plat.
  @Delete('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESTAURATEUR)
  remove(
    @Param('id') id: string,
    @Req() request: any,
  ) {
    return this.productsService.remove(
      id,
      request.user.sub,
    );
  }
}