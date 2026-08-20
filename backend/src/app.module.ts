import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import type { Connection } from 'mongoose';
// import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './common/shared.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { tenantPlugin } from './common/plugins/tenant.plugin';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { MembershipModule } from './modules/membership/membership.module';
import { UserModule } from './modules/user/user.module';
import { TaskModule } from './modules/task/task.module';
import { TeamModule } from './modules/team/team.module';
import { AutomationModule } from './modules/automation/automation.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
        connectionFactory: (connection: Connection) => {
          connection.plugin(tenantPlugin);
          return connection;
        },
      }),
      inject: [ConfigService],
    }),

    /**
     * BullMQ - Connect Redis Cloud.
     */
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: parseInt(config.get<string>('REDIS_PORT') ?? '6379', 10),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    ScheduleModule.forRoot(),

    SharedModule,
    OrganizationModule,
    MembershipModule,
    UserModule,
    AuthModule,
    TaskModule,
    TeamModule,
    AutomationModule,
    SeederModule,
  ],
  controllers: [],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
