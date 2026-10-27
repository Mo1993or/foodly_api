
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/shemas/user.shema';

@Controller('admins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminsController {
  constructor(
    private readonly adminsService: AdminsService,
  ) {}

  @Post()
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.adminsService.createAdmin(dto);
  }

  @Get()
  findAllAdmins() {
    return this.adminsService.findAllAdmins();
  }

  @Patch(':id/suspend')
  suspendAdmin(@Param('id') id: string) {
    return this.adminsService.suspendAdmin(id);
  }

  @Patch(':id/activate')
  activateAdmin(@Param('id') id: string) {
    return this.adminsService.activateAdmin(id);
  }
}
