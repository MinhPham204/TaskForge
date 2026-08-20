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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { UserRole } from '../user/schemas/user.schema';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TaskService, WorkloadReport } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  AddTodoItemDto,
  RejectTaskDto,
  UpdateProgressDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
} from './dto/update-task.dto';
import { TaskStatus } from './schemas/task.schema';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';

interface AuthUser {
  _id: { toString(): string };
  name: string;
  team?: string;
}

@ApiTags('Tasks')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  /** Tạo task mới trong organization hiện tại */
  @ApiOperation({
    summary: 'Create a new task',
    description:
      'Mutate action. Allowed only when current user has task mutation access on target team (TEAM_LEAD or task actor rules at service layer).',
  })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Bạn không có quyền thao tác trên Task này',
  })
  @ApiResponse({
    status: 404,
    description: 'Team not found in your organization',
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTaskDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.create(dto, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /** Lấy danh sách tasks (có thể filter theo status, assignedTo, team) */
  @ApiOperation({
    summary: 'Get all tasks in current organization',
    description:
      'Read action. Returns tasks in current tenant organization with optional filters.',
  })
  @ApiQuery({ name: 'status', enum: TaskStatus, required: false })
  @ApiQuery({ name: 'assignedTo', required: false })
  @ApiQuery({ name: 'team', required: false })
  @ApiResponse({ status: 200, description: 'Task list retrieved successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @Get()
  findAll(
    @Query('status') status?: TaskStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('team') team?: string,
  ) {
    return this.taskService.findAll({ status, assignedTo, team });
  }

  /**
   * Workload Analysis — ORG_OWNER/ORG_ADMIN only.
   * MongoDB Aggregation: $match -> $facet { byStatus, byPriority, byAssignee }.
   * byAssignee dùng $unwind + $lookup để lấy name/email từ users collection.
   */
  @ApiOperation({
    summary: 'Workload analysis report (ORG_OWNER/ORG_ADMIN only)',
    description:
      'Organization-level monitoring endpoint. Only ORG_OWNER or ORG_ADMIN can access.',
  })
  @UseGuards(OrgAdminGuard)
  @ApiResponse({
    status: 200,
    description: 'Returns task breakdown by status, priority, and assignee',
    schema: {
      example: {
        byStatus: [{ status: 'In Progress', count: 5 }],
        byPriority: [{ priority: 'High', count: 3 }],
        byAssignee: [
          {
            userId: '...',
            userName: 'Alice',
            email: 'alice@org.com',
            taskCount: 4,
            statuses: ['In Progress', 'Pending'],
          },
        ],
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
      'Forbidden - Only ORG_OWNER or ORG_ADMIN can perform this action',
  })
  @Get('reports/workload')
  getWorkloadReport(): Promise<WorkloadReport> {
    return this.taskService.getWorkloadReport();
  }

  /** Dashboard tổng thể cho cấp Organization (ORG_OWNER/ORG_ADMIN). */
  @ApiOperation({
    summary: 'Get organization dashboard (ORG_OWNER/ORG_ADMIN only)',
    description:
      'Company-wide dashboard for infrastructure-level roles. Does not grant mutate rights.',
  })
  @ApiResponse({ status: 200, description: 'Organization dashboard data' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only ORG_OWNER or ORG_ADMIN can perform this action',
  })
  @UseGuards(OrgAdminGuard)
  @Get('dashboard/organization')
  getOrganizationDashboard() {
    return this.taskService.getOrganizationDashboard();
  }

  /**
   * Dashboard Team Lead.
   * Chỉ trả về thống kê của các team mà user hiện tại đang là TEAM_LEAD.
   * Nếu không lead team nào, trả về empty state.
   */
  @ApiOperation({
    summary: 'Get dashboard for Team Lead scope',
    description:
      'Returns dashboard aggregated from teams where current user is TEAM_LEAD. Returns empty state if none.',
  })
  @ApiResponse({ status: 200, description: 'Team Lead dashboard data' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @Get('dashboard/team-lead')
  getTeamLeadDashboard(@GetUser() user: AuthUser) {
    return this.taskService.getTeamLeadDashboard(user._id.toString());
  }

  /**
   * Dashboard Team Member.
   * Chỉ trả về thống kê task cá nhân được giao cho user hiện tại.
   * Nếu user chưa có task/team, trả về empty state.
   */
  @ApiOperation({
    summary: 'Get dashboard for Team Member scope',
    description:
      'Returns personal dashboard scoped to tasks assigned to current user. Returns empty state if none.',
  })
  @ApiResponse({ status: 200, description: 'Team Member dashboard data' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @Get('dashboard/team-member')
  getTeamMemberDashboard(@GetUser() user: AuthUser) {
    return this.taskService.getTeamMemberDashboard(user._id.toString());
  }

  /** Lấy task theo ID */
  @ApiOperation({
    summary: 'Get task by ID',
    description: 'Read action in current tenant organization.',
  })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.taskService.findById(id);
  }

  /** Cập nhật task */
  @ApiOperation({
    summary: 'Update task',
    description:
      'Mutate action protected by service-level defense-in-depth (TEAM_LEAD or task actor only).',
  })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You are not the owner of this task',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.update(id, dto, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /** Cập nhật chỉ status */
  @ApiOperation({
    summary: 'Update task status',
    description:
      'Mutate action with strict service-level task mutation authorization.',
  })
  @ApiResponse({ status: 200, description: 'Task status updated successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You are not the owner of this task',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.updateStatus(id, dto, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /** Cập nhật tiến độ thủ công */
  @ApiOperation({
    summary: 'Update task progress manually',
    description:
      'Mutate action with strict service-level task mutation authorization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Task progress updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You are not the owner of this task',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.updateProgress(id, dto, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /**
   * Member nộp task để Admin/Owner phê duyệt.
   * Task phải đang ở trạng thái IN_PROGRESS.
   * Sau khi submit: status -> PENDING_APPROVAL, đẩy job vào notification-queue.
   */
  @ApiOperation({
    summary: 'Submit task for approval',
    description:
      'Mutate action for task actor scope. Task must be IN_PROGRESS before submission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Task submitted for approval successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Task status is not IN_PROGRESS',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You are not the owner of this task',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Patch(':id/submit')
  @HttpCode(HttpStatus.OK)
  submitForApproval(
    @Param('id') id: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.submitForApproval(id, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /**
   * TEAM_LEAD phê duyệt task đang PENDING_APPROVAL.
   * status -> COMPLETED, progress = 100, approvedBy = adminId.
   */
  @ApiOperation({
    summary: 'Approve a pending task (TEAM_LEAD only)',
    description:
      'Mutate action. Requires task mutation access and TEAM_LEAD role on task team. Task must be PENDING_APPROVAL.',
  })
  @ApiResponse({ status: 200, description: 'Task approved successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Task status is not PENDING_APPROVAL',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - You are not the owner of this task',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveTask(
    @Param('id') id: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.approveTask(id, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /**
   * TEAM_LEAD từ chối task và trả về IN_PROGRESS để Member chỉnh sửa.
   * status -> IN_PROGRESS, rejectionReason = lý do.
   */
  @ApiOperation({
    summary: 'Reject a pending task (TEAM_LEAD only)',
    description:
      'Mutate action. Requires task mutation access and TEAM_LEAD role on task team. Task must be PENDING_APPROVAL.',
  })
  @ApiResponse({ status: 200, description: 'Task rejected successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Task status is not PENDING_APPROVAL',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Bạn không có quyền thao tác trên Task này',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectTask(
    @Param('id') id: string,
    @Body() dto: RejectTaskDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.rejectTask(id, dto, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /** Xóa task */
  @ApiOperation({
    summary: 'Delete task',
    description:
      'Mutate action with strict service-level task mutation authorization.',
  })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Bạn không có quyền thao tác trên Task này',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(
    @Param('id') id: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.delete(id, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /** Thêm todo item vào checklist */
  @ApiOperation({
    summary: 'Add todo item to task checklist',
    description:
      'Mutate action with strict service-level task mutation authorization.',
  })
  @ApiResponse({ status: 201, description: 'Todo item added successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Bạn không có quyền thao tác trên Task này',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Post(':id/todos')
  @HttpCode(HttpStatus.CREATED)
  addTodo(
    @Param('id') taskId: string,
    @Body() dto: AddTodoItemDto,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.addTodoItem(taskId, dto, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /** Toggle hoàn thành todo item (tự tính lại progress) */
  @ApiOperation({
    summary: 'Toggle todo item completion',
    description:
      'Mutate action with strict service-level task mutation authorization.',
  })
  @ApiResponse({ status: 200, description: 'Todo item toggled successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Bạn không có quyền thao tác trên Task này',
  })
  @ApiResponse({ status: 404, description: 'Task or todo item not found' })
  @Patch(':id/todos/:todoId/toggle')
  toggleTodo(
    @Param('id') taskId: string,
    @Param('todoId') todoId: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.toggleTodoItem(taskId, todoId, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }

  /** Xóa todo item */
  @ApiOperation({
    summary: 'Remove todo item',
    description:
      'Mutate action with strict service-level task mutation authorization.',
  })
  @ApiResponse({ status: 200, description: 'Todo item removed successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Bạn không có quyền thao tác trên Task này',
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Delete(':id/todos/:todoId')
  @HttpCode(HttpStatus.OK)
  removeTodo(
    @Param('id') taskId: string,
    @Param('todoId') todoId: string,
    @GetUser() user: AuthUser,
    @CurrentMembership('role') role: UserRole,
  ) {
    return this.taskService.removeTodoItem(taskId, todoId, {
      userId: user._id.toString(),
      name: user.name,
      role,
    });
  }
}
