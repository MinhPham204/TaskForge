import {
  Controller,
  Get,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresDashboardReadService } from '../application/dashboard-read.service';

@ApiTags('Dashboard')
@ApiBearerAuth('accessToken')
@Controller('dashboard')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresDashboardController {
  constructor(private readonly dashboard: PostgresDashboardReadService) {}

  @Get()
  @ApiOperation({
    summary:
      'Read the active Organization personal dashboard with visibility-scoped work and schedule',
  })
  read(@Req() request: PostgresTenantRequest) {
    if (!request.postgresTenant) {
      throw new Error('Verified PostgreSQL tenant context is required');
    }
    return this.dashboard.read({
      organizationId: request.postgresTenant.organizationId,
      membershipId: request.postgresTenant.id,
    });
  }
}
