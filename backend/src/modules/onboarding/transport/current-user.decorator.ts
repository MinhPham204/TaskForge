import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/** Reads only the PostgreSQL JWT subject established by the target auth guard. */
export const PostgresCurrentUserId = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { sub?: string } }>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  },
);
