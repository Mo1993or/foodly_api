
import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    sub?: string;
    userId?: string;
    id?: string;
  };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Enregistrer un appareil pour les notifications push
   */
  @Post('register-token')
  async registerToken(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    const userId =
      req.user?.sub ||
      req.user?.userId ||
      req.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Utilisateur non authentifié.',
      );
    }

    return this.notificationsService.registerDeviceToken(
      userId,
      dto,
    );
  }

  /**
   * Désactiver un appareil
   */
  @Delete('unregister-token')
  async unregisterToken(
    @Req() req: AuthenticatedRequest,
    @Body('token') token: string,
  ) {
    const userId =
      req.user?.sub ||
      req.user?.userId ||
      req.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Utilisateur non authentifié.',
      );
    }

    return this.notificationsService.unregisterDeviceToken(
      userId,
      token,
    );
  }
}
