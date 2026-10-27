
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotImplementedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/user.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  UserRole,
  UserStatus,
} from '../users/shemas/user.shema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Inscription publique désactivée.
   * Les comptes professionnels seront créés via des routes protégées.
   */
  async register(_dto: RegisterDto) {
    throw new NotImplementedException(
      'L’inscription publique est désactivée. Contactez Foodly pour obtenir un compte professionnel.',
    );
  }

  /**
   * Connexion du Super Admin, de l'Admin ou du Restaurateur.
   */
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

  /**
   * Création de la session JWT.
   */
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

    return {
      message: 'Connexion réussie.',
      data: {
        user,
        accessToken,
        tokenType: 'Bearer',
        expiresIn: '1d',
      },
    };
  }
}
