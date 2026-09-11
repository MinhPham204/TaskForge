import {
  Body,
  Controller,
  Delete,
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
import { PostgresTeamService } from '../application/team.service';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  AddPostgresTeamMemberDto,
  CreatePostgresTeamDto,
  UpdatePostgresTeamDto,
} from './dto/team.dto';

@ApiTags('PostgreSQL teams')
@ApiBearerAuth('accessToken')
@Controller('teams')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresTeamController {
  constructor(private readonly teams: PostgresTeamService) {}

  @Get()
  @ApiOperation({ summary: 'List active Teams in the verified Organization' })
  list(@Req() request: PostgresTenantRequest) {
    return this.teams.list(requiredActor(request));
  }

  @Get(':teamId')
  @ApiOperation({ summary: 'Read an active Team and its active members' })
  get(
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.teams.get(requiredActor(request), teamId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a role-free Team in the active Organization',
  })
  @ApiCreatedResponse({
    description: 'Team created by an active Organization owner or admin',
  })
  create(
    @Body() dto: CreatePostgresTeamDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.teams.create(requiredActor(request), dto);
  }

  @Patch(':teamId')
  @ApiOperation({
    summary: 'Update an active Team in the verified Organization',
  })
  @ApiOkResponse({ description: 'Team updated' })
  update(
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Body() dto: UpdatePostgresTeamDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.teams.update(requiredActor(request), teamId, dto);
  }

  @Post(':teamId/archive')
  @ApiOperation({ summary: 'Archive an active Team without deleting history' })
  @ApiOkResponse({ description: 'Team archived' })
  archive(
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.teams.archive(requiredActor(request), teamId);
  }

  @Post(':teamId/members')
  @ApiOperation({ summary: 'Add an active Organization Member to a Team' })
  @ApiCreatedResponse({
    description: 'Role-free Team member relation created or restored',
  })
  addMember(
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Body() dto: AddPostgresTeamMemberDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.teams.addMember(
      requiredActor(request),
      teamId,
      dto.organizationMembershipId,
    );
  }

  @Delete(':teamId/members/:organizationMembershipId')
  @ApiOperation({ summary: 'Remove an active Team member relation' })
  @ApiOkResponse({ description: 'Team member relation soft-removed' })
  removeMember(
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('organizationMembershipId', new ParseUUIDPipe({ version: '4' }))
    organizationMembershipId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.teams.removeMember(
      requiredActor(request),
      teamId,
      organizationMembershipId,
    );
  }
}

function requiredActor(request: PostgresTenantRequest) {
  if (!request.postgresTenant)
    throw new Error('Verified PostgreSQL tenant context is required');
  return {
    organizationId: request.postgresTenant.organizationId,
    membershipId: request.postgresTenant.id,
  };
}
