
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/user.service';
import {
  UserRole,
  UserStatus,
} from '../users/shemas/user.shema';
import { CreateAdminDto } from './dto/create-admin.dto';

@Injectable()
export class AdminsService {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  async createAdmin(dto: CreateAdminDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.usersService.createUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: UserRole.ADMIN,
    });
  }

  async findAllAdmins() {
    return this.usersService.findAll(UserRole.ADMIN);
  }

  async suspendAdmin(id: string) {
    const admin = await this.usersService.findById(id);

    if (admin.role !== UserRole.ADMIN) {
      throw new NotFoundException(
        'Administrateur introuvable.',
      );
    }

    if (admin.status === UserStatus.SUSPENDED) {
      throw new BadRequestException(
        'Cet administrateur est déjà suspendu.',
      );
    }

    return this.usersService.updateStatus(
      id,
      UserStatus.SUSPENDED,
    );
  }

  async activateAdmin(id: string) {
    const admin = await this.usersService.findById(id);

    if (admin.role !== UserRole.ADMIN) {
      throw new NotFoundException(
        'Administrateur introuvable.',
      );
    }

    if (admin.status === UserStatus.ACTIVE) {
      throw new BadRequestException(
        'Cet administrateur est déjà actif.',
      );
    }

    return this.usersService.updateStatus(
      id,
      UserStatus.ACTIVE,
    );
  }
}
