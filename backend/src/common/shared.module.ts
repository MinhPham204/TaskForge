import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { redisProvider } from '../providers/redis.provider';
import { EmailService } from './services/email.service';
import { RedisService } from './services/redis.service';
import { OperationalLogger } from './observability/operational-logger';
import { HttpRequestLoggingInterceptor } from './observability/http-request-logging.interceptor';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    redisProvider,
    RedisService,
    EmailService,
    OperationalLogger,
    HttpRequestLoggingInterceptor,
  ],
  exports: [
    RedisService,
    EmailService,
    OperationalLogger,
    HttpRequestLoggingInterceptor,
  ],
})
export class SharedModule {}
