import { HttpException } from '@nestjs/common';

/** Add a machine-readable reason without changing Nest's exception/status/message. */
export function withErrorCode<T extends HttpException>(
  error: T,
  code: string,
): T {
  const response = error.getResponse();
  if (typeof response === 'object' && response !== null) {
    Object.assign(response, { code });
  }
  return error;
}
