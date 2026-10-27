
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UserRole } from 'src/modules/users/shemas/user.shema';

export interface AuthenticatedUser {
  sub: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Token manquant ou invalide.');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AuthenticatedUser>(token);

      if (
        !payload.sub ||
        !Object.values(UserRole).includes(payload.role)
      ) {
        throw new UnauthorizedException('Token invalide.');
      }

      request.user = {
        sub: payload.sub,
        role: payload.role,
      };

      return true;
    } catch {
      throw new UnauthorizedException(
        'Session invalide ou expirée. Veuillez vous reconnecter.',
      );
    }
  }
}
