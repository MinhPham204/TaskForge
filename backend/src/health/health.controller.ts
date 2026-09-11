import {
  Controller,
  Get,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../providers/redis.provider';

export interface HealthCheckResult {
  status: 'ok';
}

export interface ReadinessCheckResult {
  status: 'ok';
  details: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Optional() private readonly dataSource?: DataSource,
    @Optional() @Inject(REDIS_CLIENT) private readonly redisClient?: any,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: 200,
    description: 'Application process is alive and serving HTTP requests',
  })
  check(): HealthCheckResult {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe verifying PostgreSQL and Redis connections',
  })
  @ApiResponse({
    status: 200,
    description: 'All backing dependencies are ready to accept traffic',
  })
  @ApiResponse({
    status: 503,
    description: 'One or more backing dependencies are unavailable',
  })
  async ready(): Promise<ReadinessCheckResult> {
    return this.checkReadiness();
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe alias' })
  async readiness(): Promise<ReadinessCheckResult> {
    return this.checkReadiness();
  }

  private async checkReadiness(): Promise<ReadinessCheckResult> {
    let postgresStatus: 'up' | 'down' = 'down';
    let redisStatus: 'up' | 'down' = 'down';

    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        await this.dataSource.query('SELECT 1');
        postgresStatus = 'up';
      } catch {
        postgresStatus = 'down';
      }
    } else if (this.dataSource) {
      postgresStatus = 'down';
    } else {
      postgresStatus = 'up';
    }

    if (this.redisClient) {
      try {
        if (typeof this.redisClient.ping === 'function') {
          const res = await this.redisClient.ping();
          if (res === 'PONG' || res) {
            redisStatus = 'up';
          }
        } else {
          redisStatus = 'up';
        }
      } catch {
        redisStatus = 'down';
      }
    } else {
      redisStatus = 'up';
    }

    if (postgresStatus !== 'up' || redisStatus !== 'up') {
      throw new ServiceUnavailableException({
        status: 'down',
        details: {
          postgres: postgresStatus,
          redis: redisStatus,
        },
      });
    }

    return {
      status: 'ok',
      details: {
        postgres: postgresStatus,
        redis: redisStatus,
      },
    };
  }
}
