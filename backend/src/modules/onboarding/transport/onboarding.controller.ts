import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { PostgresOrganizationPermissionService } from '../application/organization-permission.service';
import { PostgresOrganizationRoleService } from '../application/organization-role.service';
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
import { AssignOrganizationRoleDto, CreateOrganizationRoleDto, OrganizationRoleVersionDto, ReplaceOrganizationRolePermissionsDto, UpdateOrganizationRoleDto } from './dto/organization-role.dto';

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
    private readonly permissions: PostgresOrganizationPermissionService,
    private readonly roles: PostgresOrganizationRoleService,
  ) {}

  @Get('workspaces')
  @ApiOperation({
    summary: 'List active workspaces for the authenticated user',
  })
  @ApiOkResponse({ description: 'Membership-derived workspace list' })
  listWorkspaces(@PostgresCurrentUserId() userId: string) {
    return this.workspaces.listWorkspaces(userId);
  }

  @Get('organizations/:organizationId/permissions/me')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'Read effective Organization capabilities for the authenticated Member' })
  @ApiOkResponse({ description: 'Current role summary and effective permissions' })
  getMyOrganizationPermissions(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.permissions.resolve(userId, organizationId);
  }

  @Get('organizations/:organizationId/permissions')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  listOrganizationPermissions(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.listPermissions(userId, organizationId);
  }

  @Get('organizations/:organizationId/roles')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  listOrganizationRoles(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.listRoles(userId, organizationId);
  }

  @Post('organizations/:organizationId/roles')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  createOrganizationRole(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Body() dto: CreateOrganizationRoleDto, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.create(userId, organizationId, dto);
  }

  @Patch('organizations/:organizationId/roles/:roleId')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  updateOrganizationRole(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Param('roleId', new ParseUUIDPipe({ version: '4' })) roleId: string, @Body() dto: UpdateOrganizationRoleDto, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.update(userId, organizationId, roleId, dto);
  }

  @Put('organizations/:organizationId/roles/:roleId/permissions')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  replaceOrganizationRolePermissions(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Param('roleId', new ParseUUIDPipe({ version: '4' })) roleId: string, @Body() dto: ReplaceOrganizationRolePermissionsDto, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.replaceRolePermissions(userId, organizationId, roleId, dto);
  }

  @Post('organizations/:organizationId/roles/:roleId/archive')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  archiveOrganizationRole(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Param('roleId', new ParseUUIDPipe({ version: '4' })) roleId: string, @Body() dto: OrganizationRoleVersionDto, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.archive(userId, organizationId, roleId, dto.expectedVersion);
  }

  @Patch('organizations/:organizationId/members/:userId/role')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  assignOrganizationRole(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Param('userId', new ParseUUIDPipe({ version: '4' })) targetUserId: string, @Body() dto: AssignOrganizationRoleDto, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.assignMembershipRole(userId, organizationId, targetUserId, dto.roleId);
  }

  @Get('organizations/:organizationId/invitation-roles')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  listInvitationRoles(@PostgresCurrentUserId() userId: string, @Param('organizationId') organizationId: string, @Req() request: PostgresTenantRequest) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.roles.listInvitationRoles(userId, organizationId);
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
      },
    );
    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      roleId: invitation.roleId,
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

  @Post('organizations/:organizationId/leave')
  @UseGuards(PostgresTenantMembershipGuard)
  @UseInterceptors(PostgresTenantInterceptor)
  @ApiOperation({ summary: 'Leave the verified active Organization as non-owner' })
  leaveOrganization(
    @PostgresCurrentUserId() userId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    this.requireVerifiedOrganization(request, organizationId);
    return this.invitations.leaveOrganization(userId, organizationId);
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
