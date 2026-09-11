import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresCollaborationService } from '../application/collaboration.service';

@ApiTags('PostgreSQL Project Activity')
@ApiBearerAuth('accessToken')
@Controller('projects/:projectId/activities')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresProjectActivityController {
  constructor(private readonly collaboration: PostgresCollaborationService) {}

  @Get()
  @ApiOperation({ summary: 'List visible Project activities timeline with safe metadata' })
  @ApiOkResponse({ description: 'Timeline of Project activities' })
  list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.collaboration.listActivities(actor(request), projectId);
  }
}

function actor(request: PostgresTenantRequest) {
  if (!request.postgresTenant) {
    throw new Error('Verified PostgreSQL tenant context is required');
  }
  return {
    organizationId: request.postgresTenant.organizationId,
    membershipId: request.postgresTenant.id,
  };
}
