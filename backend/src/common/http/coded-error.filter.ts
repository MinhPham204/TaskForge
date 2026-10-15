import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

/** Scoped to Task endpoints. Validation/auth guards retain their original responses. */
@Catch(HttpException)
export class CodedErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body =
      typeof raw === 'string' ? { statusCode: status, message: raw } : raw;
    const fallback: Record<number, string> = {
      400: 'REQUEST_VALIDATION_FAILED',
      401: 'AUTH_SESSION_REQUIRED',
      403: 'ACCESS_DENIED',
      404: 'RESOURCE_NOT_FOUND',
      409: 'TASK_CONFLICT',
    };
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        ...body,
        code:
          (body as { code?: string }).code ??
          fallback[status] ??
          'REQUEST_FAILED',
      });
  }
}
