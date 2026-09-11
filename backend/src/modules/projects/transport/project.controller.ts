import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresProjectService } from '../application/project.service';
import { PostgresProjectReadService } from '../application/project-read.service';
import {
  CreatePostgresProjectDto,
  UpdatePostgresProjectDto,
} from './dto/project.dto';

@ApiTags('PostgreSQL projects')
@ApiBearerAuth('accessToken')
@Controller('projects')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresProjectController {
  constructor(
    private readonly projects: PostgresProjectService,
    private readonly reads: PostgresProjectReadService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a solo Project with General, creator PM, default statuses and modules',
  })
  @ApiCreatedResponse({ description: 'Project setup is created atomically' })
  create(
    @Body() dto: CreatePostgresProjectDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.projects.create(actor(request), dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List Projects visible in the focused Organization context',
  })
  list(@Req() request: PostgresTenantRequest) {
    return this.reads.list(actor(request));
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Read a Project with focused visibility policy' })
  get(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.get(actor(request), projectId);
  }

  @Patch(':projectId')
  @ApiOperation({
    summary: 'Update Project metadata as an active Project Manager',
  })
  @ApiOkResponse({ description: 'Project metadata updated' })
  update(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() dto: UpdatePostgresProjectDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.projects.update(actor(request), projectId, dto);
  }

  @Post(':projectId/activate')
  @ApiOperation({ summary: 'Activate a draft Project' })
  @ApiOkResponse({ description: 'Project lifecycle state changed' })
  activate(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.projects.transition(actor(request), projectId, 'activate');
  }

  @Post(':projectId/complete')
  @ApiOperation({ summary: 'Complete an active Project' })
  @ApiOkResponse({ description: 'Project lifecycle state changed' })
  complete(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.projects.transition(actor(request), projectId, 'complete');
  }

  @Post(':projectId/reopen')
  @ApiOperation({ summary: 'Reopen a completed Project' })
  @ApiOkResponse({ description: 'Project lifecycle state changed' })
  reopen(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.projects.transition(actor(request), projectId, 'reopen');
  }

  @Post(':projectId/archive')
  @ApiOperation({ summary: 'Archive a completed Project' })
  @ApiOkResponse({ description: 'Project lifecycle state changed' })
  archive(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.projects.transition(actor(request), projectId, 'archive');
  }

  @Post(':projectId/restore')
  @ApiOperation({ summary: 'Restore an archived Project to completed' })
  @ApiOkResponse({ description: 'Project lifecycle state changed' })
  restore(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.projects.transition(actor(request), projectId, 'restore');
  }
}

function actor(request: PostgresTenantRequest) {
  if (!request.postgresTenant)
    throw new Error('Verified PostgreSQL tenant context is required');
  return {
    organizationId: request.postgresTenant.organizationId,
    membershipId: request.postgresTenant.id,
  };
}
