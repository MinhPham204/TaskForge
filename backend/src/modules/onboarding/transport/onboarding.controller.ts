import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Patch,
  Param,
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
import { PostgresInvitationMembershipService } from '../application/invitation-membership.service';
import { PostgresOrganizationOnboardingService } from '../application/organization-onboarding.service';
import { PostgresWorkspaceService } from '../application/workspace.service';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../tenant/tenant-membership.guard';
import { PostgresJwtAuthGuard } from '../tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../tenant/tenant.interceptor';
import { AcceptPostgresInvitationDto } from './dto/accept-invitation.dto';
import { CreatePostgresInvitationDto } from './dto/create-invitation.dto';
import { CreatePostgresOrganizationDto } from './dto/create-organization.dto';
import { UpdatePostgresOrganizationDto } from './dto/create-organization.dto';
import { PostgresCurrentUserId } from './current-user.decorator';
import type { OrganizationRole } from '../persistence/typeorm/onboarding.entities';

/**
 * Target REST/OpenAPI contract. It is deliberately not registered in AppModule
 * until P2-10 switches the served runtime to PostgreSQL-only.
 */
@ApiTags('PostgreSQL onboarding')
@ApiBearerAuth('accessToken')
@Controller()
@UseGuards(PostgresJwtAuthGuard)
export class PostgresOnboardingController {
  constructor(
    private readonly organizations: PostgresOrganizationOnboardingService,
    private readonly workspaces: PostgresWorkspaceService,
    private readonly invitations: PostgresInvitationMembershipService,
  ) {}

  @Get('workspaces')
  @ApiOperation({
    summary: 'List active workspaces for the authenticated user',
  })
  @ApiOkResponse({ description: 'Membership-derived workspace list' })
  listWorkspaces(@PostgresCurrentUserId() userId: string) {
    return this.workspaces.listWorkspaces(userId);
  }

  @Post('organizations')
  @ApiOperation({ summary: 'Create an Organization and default General Team' })
  @ApiCreatedResponse({
    description:
      'Organization, active Owner Membership and General Team created atomically',
  })
  createOrganization(
    @PostgresCurrentUserId() userId: string,
    @Body() dto: CreatePostgresOrganizationDto,
  ) {
    return this.organizations.createOrganization(userId, dto);
  }

  @Get('organizations/:organizationId')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'Read the verified active Organization settings' })
  getOrganizationSettings(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.workspaces.getOrganizationSettings(userId, organizationId);
  }

  @Patch('organizations/:organizationId')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'Update Organization profile as Owner or Admin' })
  updateOrganization(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdatePostgresOrganizationDto,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.workspaces.updateOrganization(userId, organizationId, dto);
  }

  @Get('organizations/:organizationId/members')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'List Organization memberships as Owner or Admin' })
  listOrganizationMembers(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.invitations.listOrganizationMembers(userId, organizationId);
  }

  @Get('organizations/:organizationId/invitations')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'List pending Organization invitations as Owner or Admin' })
  listOrganizationInvitations(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.invitations.listOrganizationInvitations(userId, organizationId);
  }

  @Get('invitations')
  @ApiOperation({
    summary: 'List pending invitations for the authenticated user',
  })
  @ApiOkResponse({ description: 'Pending invitation summaries' })
  listMyInvitations(@PostgresCurrentUserId() userId: string) {
    return this.invitations.listMyPendingInvitations(userId);
  }

  @Post('invitations/accept')
  @ApiOperation({ summary: 'Accept an invitation by opaque email credential' })
  @ApiOkResponse({ description: 'Active Organization Membership' })
  acceptInvitation(
    @PostgresCurrentUserId() userId: string,
    @Body() dto: AcceptPostgresInvitationDto,
  ) {
    return this.invitations.acceptInvitation(userId, dto.token);
  }

  @Post('organizations/:organizationId/invitations')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({
    summary: 'Invite a user to the verified active Organization',
  })
  @ApiCreatedResponse({
    description: 'Invitation created; raw token is email-delivery-only',
  })
  async createInvitation(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreatePostgresInvitationDto,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    const { invitation } = await this.invitations.createInvitation(
      userId,
      organizationId,
      {
        ...dto,
        role: dto.role as OrganizationRole.ADMIN | OrganizationRole.MEMBER,
      },
    );
    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.invitedRole,
      state: invitation.state,
      expiresAt: invitation.expiresAt,
    };
  }

  @Delete('organizations/:organizationId/invitations/:invitationId')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'Revoke a pending Organization invitation as Owner or Admin' })
  async revokeInvitation(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    await this.invitations.revokeInvitation(userId, organizationId, invitationId);
  }

  @Post('organizations/:organizationId/members/:userId/suspend')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'Suspend a non-owner Organization membership as Owner or Admin' })
  suspendMembership(
    @PostgresCurrentUserId() actorUserId: string,
    @Param('organizationId') organizationId: string,
    @Param('userId') targetUserId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.invitations.suspendMembership(
      actorUserId,
      organizationId,
      targetUserId,
    );
  }

  @Delete('organizations/:organizationId/members/:userId')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'Revoke a non-owner Organization membership as Owner or Admin' })
  revokeMembership(
    @PostgresCurrentUserId() actorUserId: string,
    @Param('organizationId') organizationId: string,
    @Param('userId') targetUserId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.invitations.revokeMembership(
      actorUserId,
      organizationId,
      targetUserId,
    );
  }

  private requireVerifiedOrganization(
    request: PostgresTenantRequest,
    organizationId: string,
  ): void {
    if (request.postgresTenant?.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Organization target must match the verified workspace',
      );
    }
  }
}
