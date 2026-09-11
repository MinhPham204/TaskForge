import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectEntityManager } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { EntityManager } from 'typeorm';
import { PostgresUserRepository } from '../persistence/typeorm/onboarding.repositories';

interface PostgresAccessTokenPayload {
  sub: string;
  email: string;
}

/** Target JWT guard: verifies an enabled global User, never a global role. */
@Injectable()
export class PostgresJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: PostgresAccessTokenPayload;
    }>();
    const authorization = request.headers.authorization;
    if (Array.isArray(authorization) || !authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<PostgresAccessTokenPayload>(
          authorization.slice('Bearer '.length),
          { secret: requiredConfig(this.config, 'JWT_ACCESS_SECRET') },
        );
      const user = await new PostgresUserRepository(this.manager).findById(
        payload.sub,
      );
      if (!user || user.disabledAt) {
        throw new UnauthorizedException('User not found or disabled');
      }
      request.user = { sub: user.id, email: user.email };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}

function requiredConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(`${key} is required for PostgreSQL authentication.`);
  }
  return value;
}
