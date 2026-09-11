import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from './common/shared.module';
import { validateEnvironment } from './config/environment.validation';
import { postgresConfig } from './config/database.config';
import { createPostgresDataSourceOptions } from './database/data-source.options';
import { HealthController } from './health/health.controller';
import { PostgresOnboardingRuntimeModule } from './modules/onboarding/onboarding-runtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      load: [postgresConfig],
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...createPostgresDataSourceOptions(process.env),
        migrations: [],
      }),
    }),
    JwtModule.register({}),
    SharedModule,
    PostgresOnboardingRuntimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
