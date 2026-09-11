import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { OperationalLogger } from './operational-logger';

interface RequestLike {
  method?: string;
  path?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  postgresTenant?: { organizationId: string };
}

interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
}

@Injectable()
export class HttpRequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: OperationalLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<RequestLike>();
    const response = context.switchToHttp().getResponse<ResponseLike>();
    const requestId = requestIdFor(request.headers['x-request-id']);
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);

    const base = () => ({
      requestId,
      method: request.method ?? 'UNKNOWN',
      path: request.path ?? request.originalUrl?.split('?')[0] ?? 'UNKNOWN',
      organizationId: request.postgresTenant?.organizationId ?? null,
      durationMs: Date.now() - startedAt,
      statusCode: response.statusCode,
    });

    return next.handle().pipe(
      tap(() => this.logger.info('http_request_completed', base())),
      catchError((error: unknown) => {
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        this.logger.error('http_request_failed', { ...base(), errorName });
        return throwError(() => error);
      }),
    );
  }
}

function requestIdFor(value: string | string[] | undefined): string {
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    return value;
  }
  return randomUUID();
}
