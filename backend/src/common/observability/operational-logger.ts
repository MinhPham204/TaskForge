import { Injectable, Logger } from '@nestjs/common';

export interface OperationalEventLogger {
  info(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, context?: Record<string, unknown>): void;
}

/**
 * Small JSON logger for portfolio operations. Callers supply only technical IDs
 * and safe state; credentials, tokens, email addresses, and request bodies are
 * deliberately excluded from its contract.
 */
@Injectable()
export class OperationalLogger implements OperationalEventLogger {
  private readonly logger = new Logger(OperationalLogger.name);

  info(event: string, context: Record<string, unknown> = {}): void {
    this.logger.log(this.serialize('info', event, context));
  }

  warn(event: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(this.serialize('warn', event, context));
  }

  error(event: string, context: Record<string, unknown> = {}): void {
    this.logger.error(this.serialize('error', event, context));
  }

  private serialize(
    level: 'info' | 'warn' | 'error',
    event: string,
    context: Record<string, unknown>,
  ): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...context,
    });
  }
}
