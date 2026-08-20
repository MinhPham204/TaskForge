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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TeamService, PaginatedResult } from './team.service';
import { TeamDocument } from './schemas/team.schema';
import { UserRole } from '../user/schemas/user.schema';
import { TeamLeadGuard } from './guards/team-lead.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import {
  AddMemberDto,
  CreateTeamDto,
  InviteMemberDto,
  PaginationDto,
  UpdateTeamDto,
} from './dto/team.dto';

interface AuthUser {
  _id: { toString(): string };
}

@ApiTags('Teams')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  /** Tạo team mới (owner = user hiện tại, org = org hiện tại) */
  @ApiOperation({
    summary: 'Create a new team (ORG_OWNER/ORG_ADMIN)',
    description:
      'Infrastructure management action. Only ORG_OWNER or ORG_ADMIN can create a new team. Optional leadUserId allows assigning another user as TEAM_LEAD at creation time.',
  })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only ORG_OWNER or ORG_ADMIN can create team',
  })
  @Post()
  @UseGuards(OrgAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTeamDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.create(dto, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  @ApiOperation({
    summary: 'Get my teams',
    description:
      'Returns teams where current user is an actual member. TEAM_MEMBER can only see own teams. Supports pagination.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of my teams' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @Get('my-teams')
  async getMyTeams(
    @GetUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResult<TeamDocument>> {
    return this.teamService.getMyTeams(user._id.toString(), pagination);
  }

  /** Lấy tất cả teams trong organization */
  @ApiOperation({
    summary: 'Get all teams in current organization',
    description:
      'Organization directory view. Lists teams in current tenant organization with pagination.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of teams' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @Get()
  findAll(
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResult<TeamDocument>> {
    return this.teamService.findAll(pagination);
  }

  /** Lấy team theo ID */
  @ApiOperation({
    summary: 'Get team by ID',
    description:
      'Allowed for ORG_OWNER/ORG_ADMIN or users who are members of this team. Enforced at service layer for defense in depth.',
  })
  @ApiResponse({ status: 200, description: 'Team found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You cannot access this team',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.findById(id, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  /** Cập nhật thông tin team */
  @ApiOperation({
    summary: 'Update team info (ORG_OWNER/ORG_ADMIN/TEAM_LEAD)',
    description:
      'Team management action. Allowed for ORG_OWNER, ORG_ADMIN, or TEAM_LEAD of the target team.',
  })
  @ApiResponse({ status: 200, description: 'Team updated successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You cannot manage this team',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @Patch(':id')
  @UseGuards(TeamLeadGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.update(id, dto, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  /** Xóa team */
  @ApiOperation({
    summary: 'Delete team (ORG_OWNER/ORG_ADMIN/TEAM_LEAD)',
    description:
      'Team lifecycle management action. Allowed for ORG_OWNER, ORG_ADMIN, or TEAM_LEAD of the target team.',
  })
  @ApiResponse({ status: 200, description: 'Team deleted successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You cannot manage this team',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @Delete(':id')
  @UseGuards(TeamLeadGuard)
  @HttpCode(HttpStatus.OK)
  delete(
    @Param('id') id: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.delete(id, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  // Quản lý thành viên trong team
  /**
   * Thêm thành viên vào team.
   * User phải thuộc cùng Organization — được enforce tự động bởi ALS plugin.
   */
  @ApiOperation({
    summary: 'Add member to team (management scope)',
    description:
      'Allowed for ORG_OWNER, ORG_ADMIN, or TEAM_LEAD of this team. Target user must belong to same organization tenant.',
  })
  @ApiResponse({ status: 200, description: 'Member added successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You cannot manage this team',
  })
  @ApiResponse({ status: 404, description: 'Team or user not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - User is already a member',
  })
  @Post(':id/members')
  @UseGuards(TeamLeadGuard)
  @HttpCode(HttpStatus.OK)
  addMember(
    @Param('id') teamId: string,
    @Body() dto: AddMemberDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.addMember(teamId, dto, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  /** Xóa thành viên khỏi team */
  @ApiOperation({
    summary: 'Remove member from team (management scope)',
    description:
      'Allowed for ORG_OWNER, ORG_ADMIN, or TEAM_LEAD. TEAM_LEAD cannot remove themselves if they are the last lead.',
  })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Team management rule violated',
  })
  @ApiResponse({ status: 404, description: 'Team or member not found' })
  @Delete(':id/members/:memberId')
  @UseGuards(TeamLeadGuard)
  @HttpCode(HttpStatus.OK)
  removeMember(
    @Param('id') teamId: string,
    @Param('memberId') memberId: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.removeMember(teamId, memberId, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  /** Promote thành viên lên lead */
  @ApiOperation({
    summary: 'Promote member to TEAM_LEAD',
    description:
      'Allowed for ORG_OWNER, ORG_ADMIN, or TEAM_LEAD. Only current TEAM_MEMBER can be promoted to TEAM_LEAD.',
  })
  @ApiResponse({ status: 200, description: 'Member promoted successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You cannot manage this team',
  })
  @ApiResponse({ status: 404, description: 'Team or member not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Target is not TEAM_MEMBER',
  })
  @Patch(':id/members/:memberId/promote')
  @UseGuards(TeamLeadGuard)
  promoteToLead(
    @Param('id') teamId: string,
    @Param('memberId') memberId: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.promoteToLead(teamId, memberId, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  // ─── INVITATIONS ─────────────────────────────────────────────────────────────

  /** Mời thành viên bằng email */
  @ApiOperation({
    summary: 'Invite member by email',
    description:
      'Allowed for ORG_OWNER, ORG_ADMIN, or TEAM_LEAD. Creates invitation with token and expiration.',
  })
  @ApiResponse({ status: 200, description: 'Invitation created successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You cannot manage this team',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Already member or already invited',
  })
  @Post(':id/invitations')
  @UseGuards(TeamLeadGuard)
  @HttpCode(HttpStatus.OK)
  invite(
    @Param('id') teamId: string,
    @Body() dto: InviteMemberDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.inviteMember(teamId, dto, {
      userId: user._id.toString(),
      orgRole,
    });
  }

  /** Hủy lời mời */
  @ApiOperation({
    summary: 'Cancel pending invitation',
    description:
      'Allowed for ORG_OWNER, ORG_ADMIN, or TEAM_LEAD. Removes invitation data to invalidate existing invite link.',
  })
  @ApiResponse({ status: 200, description: 'Invitation canceled successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You cannot manage this team',
  })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @Delete(':id/invitations/:email')
  @UseGuards(TeamLeadGuard)
  @HttpCode(HttpStatus.OK)
  cancelInvitation(
    @Param('id') teamId: string,
    @Param('email') email: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') orgRole: UserRole,
  ) {
    return this.teamService.cancelInvitation(teamId, email, {
      userId: user._id.toString(),
      orgRole,
    });
  }
}
