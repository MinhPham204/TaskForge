import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
    if (request.postgresTenant?.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Invitation target must match the verified workspace',
      );
    }
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
}
