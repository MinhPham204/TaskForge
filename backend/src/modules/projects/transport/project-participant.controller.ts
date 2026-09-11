import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { PostgresProjectParticipantService } from '../application/project-participant.service';
import { PostgresProjectReadService } from '../application/project-read.service';
import {
  AddPostgresProjectMemberDto,
  AddPostgresProjectTeamDto,
} from './dto/project-participant.dto';

@ApiTags('PostgreSQL project participants')
@ApiBearerAuth('accessToken')
@Controller('projects/:projectId')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresProjectParticipantController {
  constructor(
    private readonly participants: PostgresProjectParticipantService,
    private readonly reads: PostgresProjectReadService,
  ) {}

  @Get('teams')
  @ApiOperation({
    summary: 'List active Participating Teams visible to the Project viewer',
  })
  listTeams(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.listTeams(actor(request), projectId);
  }

  @Get('members')
  @ApiOperation({
    summary: 'List active Project Members visible to the Project viewer',
  })
  listMembers(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.listMembers(actor(request), projectId);
  }

  @Post('teams')
  @ApiOperation({ summary: 'Add a Participating Team' })
  @ApiCreatedResponse()
  addTeam(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() dto: AddPostgresProjectTeamDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.participants.addTeam(actor(request), projectId, dto.teamId);
  }

  @Delete('teams/:teamId')
  @ApiOperation({ summary: 'Remove a Participating Team' })
  @ApiOkResponse()
  removeTeam(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.participants.removeTeam(actor(request), projectId, teamId);
  }

  @Post('members')
  @ApiOperation({ summary: 'Add a Project Member with a Project role' })
  @ApiCreatedResponse()
  addMember(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() dto: AddPostgresProjectMemberDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.participants.addMember(
      actor(request),
      projectId,
      dto.organizationMembershipId,
      dto.role,
    );
  }

  @Delete('members/:organizationMembershipId')
  @ApiOperation({ summary: 'Remove a Project Member' })
  @ApiOkResponse()
  removeMember(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('organizationMembershipId', new ParseUUIDPipe({ version: '4' }))
    organizationMembershipId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.participants.removeMember(
      actor(request),
      projectId,
      organizationMembershipId,
    );
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
