
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RestaurantsService } from './restaurants.service';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { ReviewRestaurantDto } from './dto/review-restaurant.dto';

import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../common/guards/jwt-auth.guard';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/shemas/user.shema';

@Controller('restaurants')
export class RestaurantsController {
  constructor(
    private readonly restaurantsService: RestaurantsService,
  ) {}

  // Inscription publique
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  registerRestaurant(@Body() dto: RegisterRestaurantDto) {
    return this.restaurantsService.registerRestaurant(dto);
  }

  // Liste publique avec filtres
  @Get()
  findPublicRestaurants(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.restaurantsService.findPublicRestaurants(
      category,
      search,
    );
  }

  // Routes administratives protégées
  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findPending() {
    return this.restaurantsService.findPending();
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  approveRestaurant(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.restaurantsService.approveRestaurant(
      id,
      request.user.sub,
    );
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  rejectRestaurant(
    @Param('id') id: string,
    @Body() dto: ReviewRestaurantDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.restaurantsService.rejectRestaurant(
      id,
      request.user.sub,
      dto.reviewNote,
    );
  }
  @Patch(':id/open-status')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RESTAURATEUR)
updateOpenStatus(
  @Param('id') id: string,
  @Body('isOpen') isOpen: boolean,
  @Req() request: AuthenticatedRequest,
) {
  return this.restaurantsService.updateOpenStatus(
    id,
    request.user.sub,
    isOpen,
  );
}
@Get('types')
findRestaurantTypes() {
  return {
    data: this.restaurantsService.findRestaurantTypes(),
  };
}
}
