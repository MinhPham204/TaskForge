import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresGlobalSearchService } from '../application/search.service';
import { PostgresGlobalSearchQueryDto } from './dto/search.dto';

@ApiTags('Search')
@ApiBearerAuth('accessToken')
@Controller('search')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresSearchController {
  constructor(private readonly search: PostgresGlobalSearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Search currently visible Projects, Tasks, and Teams in the active Organization',
  })
  read(
    @Query() query: PostgresGlobalSearchQueryDto,
    @Req() request: PostgresTenantRequest,
  ) {
    if (!request.postgresTenant) {
      throw new Error('Verified PostgreSQL tenant context is required');
    }
    return this.search.search(
      {
        organizationId: request.postgresTenant.organizationId,
        membershipId: request.postgresTenant.id,
      },
      query,
    );
  }
}
