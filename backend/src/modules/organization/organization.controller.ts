import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AddMemberOrgDto, UpdateMemberRoleDto } from './dto/add-member-org.dto';
import { OrgOwnerGuard } from './guards/org-owner.guard';
import { OrgAdminGuard } from './guards/org-admin.guard';
import { OrganizationService } from './organization.service';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';

interface AuthUser {
  _id: { toString(): string };
}

/**
 * Workspace discovery/accept-invitation routes opt out with @SkipTenant().
 * Organization management routes require a validated active Membership before
 * OrgOwnerGuard/OrgAdminGuard execute.
 */
@Controller('organizations')
@ApiBearerAuth('accessToken')
@ApiTags('Organizations')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Get()
  @SkipTenant()
  @ApiOperation({
    summary: '[TESTING] Get organizations of current user',
    description:
      'TESTING ONLY. Returns only organizations that the authenticated user is currently participating in (owner/member).',
  })
  @ApiResponse({
    status: 200,
    description: 'List of organizations that the current user belongs to',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  findAll(@GetUser() user: AuthUser) {
    // TODO (PRODUCTION WARNING):
    // ĐÂY LÀ API CHỈ DÀNH CHO MỤC ĐÍCH TESTING.
    // TRONG PRODUCTION, KHÔNG MỘT USER NÀO ĐƯỢC PHÉP LẤY DANH SÁCH TOÀN BỘ ORGANIZATIONS TRÊN HỆ THỐNG.
    // Endpoint này hiện đã giới hạn chỉ trả về các Organization mà current user đang tham gia.
    return this.orgService.findAll(user._id.toString());
  }

  /**
   * GET /api/organizations/pending-invitations
   * Get all pending organization invitations for current user
   */
  @Get('pending-invitations')
  @SkipTenant()
  @ApiOperation({
    summary: 'Get pending organization invitations',
    description:
      'Get all pending invitations to organizations for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pending invitations',
    schema: {
      properties: {
        organizations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              _id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              logoUrl: { type: 'string', nullable: true },
              owner: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                },
              },
              pendingInvitations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                    role: { type: 'string' },
                    invitedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  getPendingInvitations(@GetUser() user: AuthUser) {
    return this.orgService.getPendingInvitations(user._id.toString());
  }

  /**
   * GET /api/organizations/slug/:slug
   */
  @Get('slug/:slug')
  @SkipTenant()
  @ApiOperation({ summary: 'Get organization by slug' })
  @ApiResponse({ status: 200, description: 'Organization found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  findBySlug(@Param('slug') slug: string) {
    return this.orgService.findBySlug(slug);
  }

  /**
   * GET /api/organizations/:id
   */
  @Get(':id')
  @SkipTenant()
  @ApiOperation({ summary: 'Get organization by id' })
  @ApiResponse({ status: 200, description: 'Organization found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  findOne(@Param('id') id: string) {
    return this.orgService.findById(id);
  }

  /**
   * PATCH /api/organizations/:id
   * Update organization information - Only owner can update
   * With strict tenant isolation to prevent modifying other organizations
   */
  @Patch(':id')
  @UseGuards(OrgOwnerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update organization information',
    description:
      'Update organization details (name, logo, etc). Only the organization owner can perform this action. Tenant isolation ensures owners cannot update other organizations.',
  })
  @ApiParam({
    name: 'id',
    description: 'Organization ID',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  @ApiBody({
    type: UpdateOrganizationDto,
    description: 'Organization data to update',
    examples: {
      basic: {
        summary: 'Update organization name and logo',
        value: {
          name: 'New Organization Name',
          logoUrl: 'https://example.com/logo.png',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Organization updated successfully',
    schema: {
      properties: {
        _id: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        logoUrl: { type: 'string', nullable: true },
        owner: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
          },
        },
        members: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only the organization owner can update this organization',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflict - Organization update conflict (for example duplicated unique value)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @GetUser() user: AuthUser,
  ) {
    return this.orgService.update(id, dto, user._id.toString());
  }

  /**
   * PATCH /api/organizations/:id/deactivate
   */
  @Patch(':id/deactivate')
  @UseGuards(OrgOwnerGuard)
  @ApiOperation({
    summary: 'Deactivate organization',
    description:
      'Deactivate an organization (soft delete). Only ORG_OWNER can perform this action.',
  })
  @ApiParam({
    name: 'id',
    description: 'Organization ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Organization deactivated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only ORG_OWNER can deactivate organization',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  deactivate(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.orgService.deactivate(id, user._id.toString());
  }

  /**
   * POST /api/organizations/:id/members
   * Add member to organization by email.
   * Organization admin and owner can add members.
   */
  @Post(':id/members')
  @UseGuards(OrgAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add member to organization',
    description:
      'Invite a user to join the organization by email. Only ORG_OWNER or ORG_ADMIN can perform this action.',
  })
  @ApiParam({
    name: 'id',
    description: 'Organization ID',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  @ApiBody({
    type: AddMemberOrgDto,
    description: 'User email and optional role to add to organization',
    examples: {
      basic: {
        summary: 'Add member with default role',
        value: {
          email: 'member@company.com',
        },
      },
      withRole: {
        summary: 'Add member with specific role',
        value: {
          email: 'admin@company.com',
          role: 'admin',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Member added successfully to organization',
    schema: {
      properties: {
        _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
        name: { type: 'string' },
        slug: { type: 'string' },
        members: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of user IDs in organization',
        },
        message: {
          type: 'string',
          example: 'Member added successfully',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Invalid email, user not found, or already a member',
    schema: {
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          type: 'string',
          example: 'User with email "test@company.com" not found',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only ORG_OWNER or ORG_ADMIN can add members in this organization',
    schema: {
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: {
          type: 'string',
          example: 'Only ORG_OWNER or ORG_ADMIN can perform this action',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Organization or user not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - User already a member of organization',
  })
  addMember(
    @Param('id') orgId: string,
    @Body() dto: AddMemberOrgDto,
    @GetUser() user: AuthUser,
  ) {
    return this.orgService.addMember(
      orgId,
      dto.email,
      dto.role,
      user._id.toString(),
    );
  }

  /**
   * PATCH /api/organizations/:id/members/:userId/role
   * Update member role in organization - Only owner can do this
   */
  @Patch(':id/members/:userId/role')
  @UseGuards(OrgAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update member role in organization',
    description:
      'Change a member role between "admin" and "member". Only ORG_OWNER or ORG_ADMIN can perform this action. Additional service-level checks prevent unsafe role changes.',
  })
  @ApiParam({
    name: 'id',
    description: 'Organization ID',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID whose role to update',
    type: String,
    example: '507f1f77bcf86cd799439012',
  })
  @ApiBody({
    type: UpdateMemberRoleDto,
    description: 'New role for the member',
    examples: {
      promoteToAdmin: {
        summary: 'Promote member to admin',
        value: { role: 'admin' },
      },
      demoteToMember: {
        summary: 'Demote admin to member',
        value: { role: 'member' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Member role updated successfully',
    schema: {
      properties: {
        _id: { type: 'string' },
        name: { type: 'string' },
        members: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of member IDs',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid role or user cannot change own role',
    schema: {
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          type: 'string',
          example: 'You cannot change your own role',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only ORG_OWNER/ORG_ADMIN can update roles, ORG_ADMIN cannot update ORG_OWNER, and ORG_ADMIN cannot self-change role',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization or user not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - User is not a member or cannot modify role',
  })
  updateMemberRole(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @GetUser() user: AuthUser,
  ) {
    return this.orgService.updateMemberRole(
      orgId,
      userId,
      dto.role,
      user._id.toString(),
    );
  }

  @Delete(':id/members/:userId')
  @UseGuards(OrgAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove member from organization',
    description:
      'Remove a user from the organization. Only ORG_OWNER or ORG_ADMIN can perform this action. Cannot remove ORG_OWNER.',
  })
  @ApiParam({
    name: 'id',
    description: 'Organization ID',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID to remove from organization',
    type: String,
    example: '507f1f77bcf86cd799439012',
  })
  @ApiResponse({
    status: 200,
    description: 'Member removed successfully from organization',
    schema: {
      properties: {
        _id: { type: 'string' },
        name: { type: 'string' },
        members: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated list of user IDs in organization',
        },
        message: {
          type: 'string',
          example: 'Member removed successfully',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Cannot remove organization owner',
    schema: {
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          type: 'string',
          example: 'Cannot remove organization owner from organization',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only ORG_OWNER/ORG_ADMIN can remove members, and ORG_ADMIN cannot remove ORG_OWNER',
    schema: {
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: {
          type: 'string',
          example: 'ORG_ADMIN cannot remove ORG_OWNER',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Organization or member not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Cannot remove organization owner',
  })
  removeMember(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.orgService.removeMember(orgId, userId, user._id.toString());
  }

  /**
   * POST /api/organizations/:id/accept-invitation
   * Accept pending organization invitation - chuyển user từ chưa có org sang org mới
   */
  @Post(':id/accept-invitation')
  @SkipTenant()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept organization invitation',
    description:
      'Authenticated user accepts pending invitation to join a new organization. If user belongs to another organization, cleanup logic will be applied on old organization before joining new one.',
  })
  @ApiParam({
    name: 'id',
    description: 'New Organization ID to join',
    type: String,
    example: '507f1f77bcf86cd799439011',
  })
  @ApiResponse({
    status: 200,
    description:
      'Invitation accepted successfully - user joined new organization',
    schema: {
      properties: {
        _id: { type: 'string' },
        name: { type: 'string' },
        members: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated list of member IDs (now includes this user)',
        },
        pendingInvitations: {
          type: 'array',
          description: 'Updated pending invitations (this user removed)',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 404,
    description:
      'Organization not found or no pending invitation for this user',
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflict - User already member of new org, or is owner of old org with multiple members (must transfer ownership first)',
    schema: {
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: {
          type: 'string',
          example:
            'Bạn phải chuyển nhượng quyền Owner cho người khác trước khi rời khỏi Tổ chức này',
        },
      },
    },
  })
  acceptInvitation(@Param('id') orgId: string, @GetUser() user: AuthUser) {
    return this.orgService.acceptInvitation(orgId, user._id.toString());
  }
}
