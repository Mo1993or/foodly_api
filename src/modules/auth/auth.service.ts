
import {
  Injectable,
  UnauthorizedException,
  NotImplementedException,
  Inject,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/user.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

import {
  UserRole,
  UserStatus,
} from '../users/shemas/user.shema';

import { Restaurant } from '../restaurants/schemas/restaurant.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,

    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<Restaurant>,
  ) {}

  async register(_dto: RegisterDto) {
    throw new NotImplementedException(
      'L’inscription publique est désactivée. Contactez Foodly pour obtenir un compte professionnel.',
    );
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException(
        'E-mail ou mot de passe incorrect.',
      );
    }

    const passwordIsValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException(
        'E-mail ou mot de passe incorrect.',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Ce compte est suspendu.',
      );
    }

    if (!Object.values(UserRole).includes(user.role)) {
      throw new UnauthorizedException(
        'Le rôle de ce compte est invalide.',
      );
    }

    return this.createSession(
      this.usersService.toPublicUser(user),
    );
  }

  private async createSession(user: {
    _id: unknown;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  }) {
    const payload = {
      sub: String(user._id),
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    let restaurant = null;

    if (user.role === UserRole.RESTAURATEUR) {
      if (Types.ObjectId.isValid(String(user._id))) {
        restaurant = await this.restaurantModel
          .findOne({
            ownerId: new Types.ObjectId(String(user._id)),
          })
          .select('-reviewedBy')
          .lean()
          .exec();
      }
    }

    return {
      message: 'Connexion réussie.',
      data: {
        user,
        restaurant,
        accessToken,
        tokenType: 'Bearer',
        expiresIn: '1d',
      },
    };
  }
}
