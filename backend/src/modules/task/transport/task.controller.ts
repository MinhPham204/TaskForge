import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { PostgresTaskService } from '../application/task.service';
import { PostgresTaskReadService } from '../application/task-read.service';
import {
  AddPostgresTaskChecklistItemDto,
  AssignPostgresTaskDto,
  CreatePostgresTaskDto,
  CreatePostgresCommentDto,
  ConfigurePostgresTaskApprovalDto,
  SetPostgresTaskChecklistItemCompletionDto,
  SetPostgresTaskManualProgressDto,
  TransitionPostgresTaskStatusDto,
  UpdatePostgresTaskDto,
  UpdatePostgresCommentDto,
  ResolvePostgresTaskApprovalDto,
  PostgresTaskQueryDto,
} from './dto/task.dto';

@ApiTags('PostgreSQL tasks')
@ApiBearerAuth('accessToken')
@Controller('projects/:projectId/tasks')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresTaskController {
  constructor(
    private readonly tasks: PostgresTaskService,
    private readonly reads: PostgresTaskReadService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List visible Tasks with scoped filters and search' })
  list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Query() query: PostgresTaskQueryDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.list(actor(request), projectId, query);
  }

  @Get('board')
  @ApiOperation({ summary: 'Read the visible Task board grouped by status' })
  board(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Query() query: PostgresTaskQueryDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.board(actor(request), projectId, query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Read visible Task dashboard metrics' })
  overview(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Query() query: PostgresTaskQueryDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.overview(actor(request), projectId, query);
  }

  @Get('report')
  @ApiOperation({ summary: 'Read visible Task report and workload data' })
  report(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Query() query: PostgresTaskQueryDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.report(actor(request), projectId, query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tasks.csv"')
  @ApiOperation({ summary: 'Export visible filtered Tasks as CSV' })
  exportCsv(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Query() query: PostgresTaskQueryDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.exportCsv(actor(request), projectId, query);
  }

  @Get(':taskId')
  @ApiOperation({ summary: 'Read visible Task detail and collaboration data' })
  detail(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.detail(actor(request), projectId, taskId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a Task under an active Participating Team' })
  @ApiCreatedResponse({ description: 'Task created' })
  create(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() dto: CreatePostgresTaskDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.create(actor(request), projectId, dto);
  }

  @Patch(':taskId')
  @ApiOperation({
    summary: 'Update permitted Task content or management fields',
  })
  @ApiOkResponse({ description: 'Task updated' })
  update(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Body() dto: UpdatePostgresTaskDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.update(actor(request), projectId, taskId, dto);
  }

  @Patch(':taskId/status')
  @ApiOperation({
    summary: 'Transition Task status through the semantic workflow',
  })
  @ApiOkResponse({ description: 'Task status transitioned' })
  transitionStatus(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Body() dto: TransitionPostgresTaskStatusDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.transitionStatus(
      actor(request),
      projectId,
      taskId,
      dto.statusId,
    );
  }

  @Patch(':taskId/manual-progress')
  @ApiOperation({ summary: 'Set manual progress when the Task has no checklist' })
  @ApiOkResponse({ description: 'Task manual progress updated' })
  setManualProgress(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Body() dto: SetPostgresTaskManualProgressDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.setManualProgress(
      actor(request),
      projectId,
      taskId,
      dto.manualProgress,
    );
  }

  @Post(':taskId/checklist-items')
  @ApiOperation({ summary: 'Add a Task checklist item' })
  @ApiCreatedResponse({ description: 'Checklist item created' })
  addChecklistItem(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Body() dto: AddPostgresTaskChecklistItemDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.addChecklistItem(actor(request), projectId, taskId, dto);
  }

  @Patch(':taskId/checklist-items/:itemId')
  @ApiOperation({
    summary: 'Mark a Task checklist item complete or incomplete',
  })
  @ApiOkResponse({ description: 'Checklist item completion updated' })
  setChecklistItemCompletion(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
    @Body() dto: SetPostgresTaskChecklistItemCompletionDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.setChecklistItemCompletion(
      actor(request),
      projectId,
      taskId,
      itemId,
      dto.completed,
    );
  }

  @Get(':taskId/comments')
  @ApiOkResponse({ description: 'Visible Task comments' })
  listComments(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Req() request: PostgresTenantRequest,
  ) { return this.tasks.listComments(actor(request), projectId, taskId); }

  @Patch(':taskId/approval')
  configureApproval(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string, @Body() dto: ConfigurePostgresTaskApprovalDto, @Req() request: PostgresTenantRequest) {
    return this.tasks.configureApproval(actor(request), projectId, taskId, { approverProjectMembershipId: dto.approverProjectMembershipId ?? null });
  }
  @Post(':taskId/approval-requests')
  requestApproval(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string, @Body() dto: ResolvePostgresTaskApprovalDto, @Req() request: PostgresTenantRequest) {
    return this.tasks.requestApproval(actor(request), projectId, taskId, dto.reason);
  }
  @Post(':taskId/approval-requests/:action')
  resolveApproval(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string, @Param('action') action: 'approve' | 'reject' | 'cancel', @Body() dto: ResolvePostgresTaskApprovalDto, @Req() request: PostgresTenantRequest) {
    if (!['approve', 'reject', 'cancel'].includes(action)) throw new Error('Invalid approval action');
    return this.tasks.resolveApproval(actor(request), projectId, taskId, action, dto.reason);
  }

  @Post(':taskId/comments')
  @ApiCreatedResponse({ description: 'Comment created' })
  createComment(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Body() dto: CreatePostgresCommentDto,
    @Req() request: PostgresTenantRequest,
  ) { return this.tasks.createComment(actor(request), projectId, taskId, dto); }

  @Patch(':taskId/comments/:commentId')
  @ApiOkResponse({ description: 'Comment updated' })
  editComment(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Param('commentId', new ParseUUIDPipe({ version: '4' })) commentId: string,
    @Body() dto: UpdatePostgresCommentDto,
    @Req() request: PostgresTenantRequest,
  ) { return this.tasks.editComment(actor(request), projectId, taskId, commentId, dto); }

  @Delete(':taskId/comments/:commentId')
  @ApiOkResponse({ description: 'Comment soft-deleted' })
  deleteComment(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Param('commentId', new ParseUUIDPipe({ version: '4' })) commentId: string,
    @Req() request: PostgresTenantRequest,
  ) { return this.tasks.deleteComment(actor(request), projectId, taskId, commentId); }

  @Post(':taskId/assignees')
  @ApiOperation({ summary: 'Assign an active owning-Team Project Member' })
  @ApiCreatedResponse({ description: 'Task assignee created' })
  assign(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Body() dto: AssignPostgresTaskDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.assign(
      actor(request),
      projectId,
      taskId,
      dto.projectMembershipId,
    );
  }

  @Delete(':taskId/assignees/:projectMembershipId')
  @ApiOperation({ summary: 'Remove an active Task assignee' })
  @ApiOkResponse({ description: 'Task assignee soft-removed' })
  unassign(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Param('projectMembershipId', new ParseUUIDPipe({ version: '4' }))
    projectMembershipId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.unassign(
      actor(request),
      projectId,
      taskId,
      projectMembershipId,
    );
  }

  @Delete(':taskId')
  @ApiOperation({ summary: 'Soft-archive a Task as an active Project Manager' })
  @ApiOkResponse({ description: 'Task archived' })
  archive(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.tasks.archive(actor(request), projectId, taskId);
  }
}

@ApiTags('PostgreSQL tasks')
@ApiBearerAuth('accessToken')
@Controller('tasks')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresWorkspaceTaskReadController {
  constructor(private readonly reads: PostgresTaskReadService) {}

  @Get('my')
  @ApiOperation({ summary: 'List Tasks assigned to the actor across visible Projects' })
  myTasks(
    @Query() query: PostgresTaskQueryDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.myTasks(actor(request), query);
  }

  @Get('approval-queue')
  @ApiOperation({ summary: 'List pending approval requests assigned to the actor' })
  approvalQueue(@Req() request: PostgresTenantRequest) {
    return this.reads.approvalQueue(actor(request));
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
