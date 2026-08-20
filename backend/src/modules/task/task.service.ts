import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, PipelineStage, Types } from 'mongoose';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';
import { Team, TeamDocument, TeamMemberRole } from '../team/schemas/team.schema';
import { User, UserDocument, UserRole } from '../user/schemas/user.schema';
import { TenantStorageService } from '../../common/als/tenant-storage.service';
import { NOTIFICATION_QUEUE } from '../automation/constants/queues';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  UpdateTaskDto,
  UpdateTaskStatusDto,
  AddTodoItemDto,
  UpdateProgressDto,
  RejectTaskDto,
} from './dto/update-task.dto';

export interface StatusStat {
  status: string;
  count: number;
}
export interface PriorityStat {
  priority: string;
  count: number;
}
export interface AssigneeStat {
  userId: string;
  userName: string;
  email: string;
  taskCount: number;
  statuses: string[];
}
export interface WorkloadReport {
  byStatus: StatusStat[];
  byPriority: PriorityStat[];
  byAssignee: AssigneeStat[];
}

export interface ApprovalRequestPayload {
  taskId: string;
  taskTitle: string;
  organizationId: string;
  submittedByName: string;
  type: 'APPROVAL_REQUEST';
}

export interface TaskActor {
  userId: string;
  name: string;
  role?: UserRole;
}

@Injectable()
export class TaskService {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Team.name) private readonly teamModel: Model<TeamDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly tenantStorage: TenantStorageService,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue<ApprovalRequestPayload>,
  ) {}

  private buildEmptyDashboardState() {
    return {
      statistics: {
        totalTasks: 0,
        pendingTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
      },
      charts: {
        taskDistribution: {
          Pending: 0,
          InProgress: 0,
          Completed: 0,
          All: 0,
        },
        taskPriorityLevels: {
          Low: 0,
          Medium: 0,
          High: 0,
        },
      },
      recentTasks: [],
    };
  }

  /**
   * Lớp phòng thủ 2 cho toàn bộ API mutate task.
   * note:
   * - TEAM_LEAD của team chứa task: được thao tác.
   * - user là người tạo task / người được assign task: được thao tác.
   * - KHÔNG bypass cho ORG_ADMIN / ORG_OWNER.
   */
  private async ensureTaskMutationAccess(
    taskId: string,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const userObjectId = new Types.ObjectId(currentUser.userId);

    const isTeamLead = await this.teamModel.exists({
      _id: task.team,
      members: {
        $elemMatch: {
          user: userObjectId,
          role: TeamMemberRole.LEAD,
        },
      },
    });

    if (isTeamLead) {
      return task;
    }

    const isCreator = task.createdBy.equals(userObjectId);
    const isAssignee = task.assignedTo.some((assigneeId) =>
      assigneeId.equals(userObjectId),
    );

    if (isCreator || isAssignee) {
      return task;
    }

    throw new ForbiddenException('Bạn không có quyền thao tác trên Task này');
  }

  /**
   * Check quyền tạo task trong team:
   * user phải là thành viên của team đó (TEAM_LEAD hoặc TEAM_MEMBER).
   */
  private async ensureCreateTaskAccess(
    teamId: string,
    currentUser: TaskActor,
  ): Promise<TeamDocument> {
    const team = await this.teamModel.findById(teamId);
    if (!team) {
      throw new NotFoundException('Team not found in your organization');
    }

    const userObjectId = new Types.ObjectId(currentUser.userId);
    const isTeamMember = team.members.some((member) =>
      member.user.equals(userObjectId),
    );

    if (!isTeamMember) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên Task này');
    }

    return team;
  }

  /**
   * @param team Khi truyền vào (create task), validate thêm assignedTo phải thuộc team.members.
   *   Không truyền (update task khi không đổi team) để giữ nguyên hành vi cũ.
   */
  private async validateAssignees(
    assigneeIds: string[],
    team?: TeamDocument,
  ): Promise<Types.ObjectId[]> {
    if (!assigneeIds || assigneeIds.length === 0) return [];

    const uniqueAssigneeIds = [...new Set(assigneeIds)];

    // Tự động chỉ tìm trong Org hiện tại (Vì có tenantStorage)
    const validUsersCount = await this.userModel.countDocuments({
      _id: { $in: uniqueAssigneeIds },
      isActive: true,
    });

    if (validUsersCount !== uniqueAssigneeIds.length) {
      throw new BadRequestException(
        'Một hoặc nhiều thành viên được giao việc không hợp lệ, bị khóa, hoặc không thuộc Tổ chức này',
      );
    }

    if (team) {
      const teamMemberIds = new Set(
        team.members.map((member) => member.user.toString()),
      );
      const notInTeam = uniqueAssigneeIds.some((id) => !teamMemberIds.has(id));
      if (notInTeam) {
        throw new BadRequestException(
          'Một hoặc nhiều thành viên được giao việc không thuộc Team của Task này',
        );
      }
    }

    return uniqueAssigneeIds.map(id => new Types.ObjectId(id));
  }

  async getDashboardData(userId?: string, teamId?: string): Promise<any> {
    // 1. Lấy OrgId từ context hiện tại (đã qua Middleware/Interceptor)
    const orgId = this.tenantStorage.getOrganizationId();
    if (!orgId) throw new BadRequestException('Organization context missing');

    // 2. Xây dựng Filter
    const matchQuery: Record<string, any> = {
      organization: new Types.ObjectId(orgId),
    };

    if (userId) matchQuery.assignedTo = new Types.ObjectId(userId);
    if (teamId) matchQuery.team = new Types.ObjectId(teamId);

    const now = new Date();

    // 3. Sử dụng $facet để gom tất cả thống kê vào 1 lần query duy nhất
    const [result] = await this.taskModel.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          // Thống kê theo Status
          statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          // Thống kê theo Priority
          priorityCounts: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
          // Đếm task quá hạn (Chưa xong và quá hạn)
          overdueCount: [
            {
              $match: {
                status: { $ne: TaskStatus.COMPLETED },
                dueDate: { $lt: now },
              },
            },
            { $count: 'count' },
          ],
          // Lấy 10 task gần đây
          recentTasks: [
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                title: 1,
                status: 1,
                priority: 1,
                dueDate: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ]);


    // 4. Format dữ liệu trả về 
    const allStatuses = ['Pending', 'In Progress', 'Completed'];
    const allPriorities = ['Low', 'Medium', 'High'];

    const taskDistribution = allStatuses.reduce((acc: any, status) => {
      const found = result.statusCounts.find((s: any) => s._id === status);
      const key = status.replace(/\s+/g, '');
      acc[key] = found ? found.count : 0;
      return acc;
    }, {});

    const taskPriorityLevels = allPriorities.reduce((acc: any, priority) => {
      const found = result.priorityCounts.find((p: any) => p._id === priority);
      acc[priority] = found ? found.count : 0;
      return acc;
    }, {});

    const totalTasks = result.statusCounts.reduce((sum: number, item: any) => sum + item.count, 0);

    return {
      statistics: {
        totalTasks,
        pendingTasks: taskDistribution['Pending'] || 0,
        completedTasks: taskDistribution['Completed'] || 0,
        overdueTasks: result.overdueCount[0]?.count || 0,
      },
      charts: {
        taskDistribution: { ...taskDistribution, All: totalTasks },
        taskPriorityLevels,
      },
      recentTasks: result.recentTasks,
    };
  }

  /** Dashboard tổng thể cấp Organization (cho ORG_OWNER/ORG_ADMIN). */
  async getOrganizationDashboard(): Promise<any> {
    return this.getDashboardData();
  }

  /**
   * Dashboard cho TEAM_LEAD:
   * - Lấy tất cả team user đang lead.
   * - Trả empty state nếu user không lead team nào.
   */
  async getTeamLeadDashboard(userId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);

    const leadTeams = await this.teamModel
      .find({
        members: {
          $elemMatch: {
            user: userObjectId,
            role: TeamMemberRole.LEAD,
          },
        },
      })
      .select('_id')
      .lean();

    if (leadTeams.length === 0) {
      return this.buildEmptyDashboardState();
    }

    const teamIds = leadTeams.map((team) => team._id);
    const orgId = this.tenantStorage.getOrganizationId();
    if (!orgId) {
      throw new BadRequestException('Organization context missing');
    }

    const matchQuery: Record<string, any> = {
      organization: new Types.ObjectId(orgId),
      team: { $in: teamIds },
    };

    const now = new Date();
    const [result] = await this.taskModel.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          priorityCounts: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
          overdueCount: [
            {
              $match: {
                status: { $ne: TaskStatus.COMPLETED },
                dueDate: { $lt: now },
              },
            },
            { $count: 'count' },
          ],
          recentTasks: [
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                title: 1,
                status: 1,
                priority: 1,
                dueDate: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ]);

    const allStatuses = ['Pending', 'In Progress', 'Completed'];
    const allPriorities = ['Low', 'Medium', 'High'];

    const taskDistribution = allStatuses.reduce((acc: any, status) => {
      const found = result.statusCounts.find((s: any) => s._id === status);
      const key = status.replace(/\s+/g, '');
      acc[key] = found ? found.count : 0;
      return acc;
    }, {});

    const taskPriorityLevels = allPriorities.reduce((acc: any, priority) => {
      const found = result.priorityCounts.find((p: any) => p._id === priority);
      acc[priority] = found ? found.count : 0;
      return acc;
    }, {});

    const totalTasks = result.statusCounts.reduce(
      (sum: number, item: any) => sum + item.count,
      0,
    );

    return {
      statistics: {
        totalTasks,
        pendingTasks: taskDistribution['Pending'] || 0,
        completedTasks: taskDistribution['Completed'] || 0,
        overdueTasks: result.overdueCount[0]?.count || 0,
      },
      charts: {
        taskDistribution: { ...taskDistribution, All: totalTasks },
        taskPriorityLevels,
      },
      recentTasks: result.recentTasks,
    };
  }

  /** Dashboard cho TEAM_MEMBER */
  async getTeamMemberDashboard(userId: string): Promise<any> {
    return this.getDashboardData(userId);
  }
  // Create task
  async create(dto: CreateTaskDto, currentUser: TaskActor): Promise<TaskDocument> {
    // Đảm bảo user thuộc org trước khi tạo → lỗi rõ ràng thay vì Mongoose ValidationError
    this.tenantStorage.requireOrganizationId();

    const team = await this.ensureCreateTaskAccess(dto.team, currentUser);
    const validAssignees = await this.validateAssignees(
      dto.assignedTo ?? [],
      team,
    );

    // Plugin tự filter team theo org hiện tại

    const task = new this.taskModel({
      ...dto,
      team: new Types.ObjectId(dto.team),
      assignedTo: validAssignees,
      createdBy: new Types.ObjectId(currentUser.userId),
      // organization: không set — plugin tự inject qua pre('validate')
    });

    return task.save();
  }

  // Read
  async findAll(filters?: {
    status?: TaskStatus;
    assignedTo?: string;
    team?: string;
  }): Promise<TaskDocument[]> {
    const query: Record<string, unknown> = {};

    if (filters?.status) query['status'] = filters.status;
    if (filters?.assignedTo)
      query['assignedTo'] = new Types.ObjectId(filters.assignedTo);
    if (filters?.team) query['team'] = new Types.ObjectId(filters.team);

    // Plugin tự thêm { organization: orgId } vào query
    return this.taskModel
      .find(query)
      .populate('assignedTo', 'name email profileImageUrl')
      .populate('createdBy', 'name email')
      .populate('team', 'name')
      .sort({ createdAt: -1 });
  }

  async findById(id: string): Promise<TaskDocument> {
    const task = await this.taskModel
      .findById(id)
      .populate('assignedTo', 'name email profileImageUrl')
      .populate('createdBy', 'name email')
      .populate('team', 'name');

    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // Update
  async update(
    id: string,
    dto: UpdateTaskDto,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    await this.ensureTaskMutationAccess(id, currentUser);

    const updateData: Record<string, unknown> = { ...dto };

    // 1. Kiểm tra Team hợp lệ (nếu có yêu cầu update Team)
    if (dto.team) {
      // Có tenant plugin => FindById chỉ tìm trong Org hiện tại 
      const team = await this.teamModel.findById(dto.team);
      if (!team) {
        throw new NotFoundException('Team không tồn tại trong Tổ chức của bạn');
      }
      updateData.team = team._id;
    }

    // 2. Check list người được giao 
    if (dto.assignedTo) {
      updateData.assignedTo = await this.validateAssignees(dto.assignedTo);
    }

    // 3. Update 
    const task = await this.taskModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('assignedTo', 'name email')
      .populate('team', 'name');

    if (!task) throw new NotFoundException('Task not found');

    return task;
  }

  async updateStatus(
    id: string,
    dto: UpdateTaskStatusDto,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    const task = await this.ensureTaskMutationAccess(id, currentUser);

    // Chặn bypass approval flow: nếu Team yêu cầu duyệt, không cho set COMPLETED trực tiếp
    // tại đây — phải đi qua submitForApproval -> approveTask. Team cũ chưa có field
    // requireApproval sẽ được Mongoose hydrate về default true.
    if (dto.status === TaskStatus.COMPLETED) {
      const team = await this.teamModel
        .findById(task.team)
        .select('requireApproval');
      const requireApproval = team?.requireApproval ?? true;
      if (requireApproval) {
        throw new BadRequestException(
          'Team này yêu cầu phê duyệt trước khi hoàn thành Task. Vui lòng dùng chức năng "Nộp để duyệt" (submit for approval).',
        );
      }
    }

    let progressUpdate: number | undefined;
    if (dto.status === TaskStatus.COMPLETED) progressUpdate = 100;
    if (dto.status === TaskStatus.PENDING) progressUpdate = 0;

    const updatePayload: Record<string, unknown> = { status: dto.status };
    if (progressUpdate !== undefined) {
      updatePayload['progress'] = progressUpdate;
    }

    const updatedTask = await this.taskModel.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true },
    );

    if (!updatedTask) throw new NotFoundException('Task not found');
    return updatedTask;
  }

  async updateProgress(
    id: string,
    dto: UpdateProgressDto,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    await this.ensureTaskMutationAccess(id, currentUser);

    const task = await this.taskModel.findByIdAndUpdate(
      id,
      { $set: { progress: dto.progress } },
      { new: true },
    );
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // Submit for approval, Approve, Reject
  /**
   * Member nộp task để Admin/Owner phê duyệt.
   * Điều kiện: task phải đang ở trạng thái IN_PROGRESS.
   * Sau khi save: đẩy job vào notification-queue để thông báo.
   */
  async submitForApproval(
    taskId: string,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    const task = await this.ensureTaskMutationAccess(taskId, currentUser);

    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Only IN_PROGRESS tasks can be submitted for approval. Current status: "${task.status}"`,
      );
    }

    task.status = TaskStatus.PENDING_APPROVAL;
    await task.save();

    // Đẩy job vào notification-queue — Consumer sẽ tái tạo ALS context và gửi email Admin
    await this.notificationQueue.add(
      'approval-request',
      {
        taskId: task._id.toString(),
        taskTitle: task.title,
        organizationId: task.organization.toString(),
        submittedByName: currentUser.name,
        type: 'APPROVAL_REQUEST',
      },
      { removeOnComplete: true, removeOnFail: 50 },
    );

    return task;
  }

  /**
   * Admin/Owner phê duyệt task.
   * Điều kiện: task phải đang ở trạng thái PENDING_APPROVAL.
   * Sau khi approve: status -> COMPLETED, progress = 100, approvedBy = adminId.
   */
  async approveTask(taskId: string, currentUser: TaskActor): Promise<TaskDocument> {
    const task = await this.ensureTaskMutationAccess(taskId, currentUser);

    const isTeamLead = await this.teamModel.exists({
      _id: task.team,
      members: {
        $elemMatch: {
          user: new Types.ObjectId(currentUser.userId),
          role: TeamMemberRole.LEAD,
        },
      },
    });

    if (!isTeamLead) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên Task này');
    }

    // Cố ý KHÔNG chặn self-approval (Team Lead approve task do chính mình tạo/được giao).
    // Quyết định có chủ đích, không phải thiếu sót: team quy mô nhỏ (agency/SME) thường
    // chỉ có 1 Team Lead — áp segregation-of-duties sẽ khiến task kẹt vĩnh viễn ở
    // PENDING_APPROVAL khi không còn ai khác đủ điều kiện duyệt. Chi tiết:
    // .spec-kit/specs/phase-1-va-loi-backend.plan.md mục 1.

    // Atomic transition: filter theo status hiện tại để tránh race condition khi 2 request
    // approve/reject cùng xử lý 1 task PENDING_APPROVAL.
    const updatedTask = await this.taskModel.findOneAndUpdate(
      { _id: taskId, status: TaskStatus.PENDING_APPROVAL },
      {
        $set: {
          status: TaskStatus.COMPLETED,
          progress: 100,
          approvedBy: new Types.ObjectId(currentUser.userId),
          rejectionReason: null,
        },
      },
      { new: true },
    );

    if (!updatedTask) {
      throw new ConflictException(
        `Task không còn ở trạng thái PENDING_APPROVAL, có thể đã được xử lý bởi thao tác khác. Current status: "${task.status}"`,
      );
    }

    return updatedTask;
  }

  /**
   * Admin/Owner từ chối task và trả về cho Member chỉnh sửa.
   * Điều kiện: task phải đang ở trạng thái PENDING_APPROVAL.
   * Sau khi reject: status -> IN_PROGRESS, rejectionReason = lý do từ chối.
   */
  async rejectTask(
    taskId: string,
    dto: RejectTaskDto,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    const task = await this.ensureTaskMutationAccess(taskId, currentUser);

    const isTeamLead = await this.teamModel.exists({
      _id: task.team,
      members: {
        $elemMatch: {
          user: new Types.ObjectId(currentUser.userId),
          role: TeamMemberRole.LEAD,
        },
      },
    });

    if (!isTeamLead) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên Task này');
    }

    // Cố ý KHÔNG chặn self-approval — xem lý do ở approveTask() phía trên.

    // Atomic transition: filter theo status hiện tại để tránh race condition khi 2 request
    // approve/reject cùng xử lý 1 task PENDING_APPROVAL.
    const updatedTask = await this.taskModel.findOneAndUpdate(
      { _id: taskId, status: TaskStatus.PENDING_APPROVAL },
      {
        $set: {
          status: TaskStatus.IN_PROGRESS,
          approvedBy: null,
          rejectionReason: dto.rejectionReason ?? null,
        },
      },
      { new: true },
    );

    if (!updatedTask) {
      throw new ConflictException(
        `Task không còn ở trạng thái PENDING_APPROVAL, có thể đã được xử lý bởi thao tác khác. Current status: "${task.status}"`,
      );
    }

    return updatedTask;
  }

  // Todo Checklist
  async addTodoItem(
    taskId: string,
    dto: AddTodoItemDto,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    await this.ensureTaskMutationAccess(taskId, currentUser);

    const task = await this.taskModel.findByIdAndUpdate(
      taskId,
      { $push: { todoCheckList: { text: dto.text, completed: false } } },
      { new: true },
    );
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async toggleTodoItem(
    taskId: string,
    todoId: string,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    const task = await this.ensureTaskMutationAccess(taskId, currentUser);

    const todo = task.todoCheckList.find((t) => t._id?.toString() === todoId);
    if (!todo) throw new NotFoundException('Todo item not found');

    todo.completed = !todo.completed;

    // Tính lại progress dựa trên tỉ lệ todo hoàn thành
    const total = task.todoCheckList.length;
    const completed = task.todoCheckList.filter((t) => t.completed).length;
    task.progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return task.save();
  }

  async removeTodoItem(
    taskId: string,
    todoId: string,
    currentUser: TaskActor,
  ): Promise<TaskDocument> {
    await this.ensureTaskMutationAccess(taskId, currentUser);

    const task = await this.taskModel.findByIdAndUpdate(
      taskId,
      { $pull: { todoCheckList: { _id: new Types.ObjectId(todoId) } } },
      { new: true },
    );
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // Workload Report
  /**
   * Báo cáo workload toàn bộ org trong 1 aggregation query ($facet).
   *
   *   aggregate() KHÔNG bị TenantPlugin filter tự động.
   *   -> Phải $match { organization: orgId } thủ công ở Stage đầu tiên.
   *
   * Pipeline:
   *   $match (org filter)
   *   → $facet {
   *       byStatus   : $group theo status  -> đếm task
   *       byPriority : $group theo priority -> đếm task
   *       byAssignee : $unwind -> $lookup users -> $group per user -> đếm task
   *     }
   */
  async getWorkloadReport(): Promise<WorkloadReport> {
    const orgId = this.tenantStorage.requireOrganizationId();

    // aggregate() Không bị TenantPlugin filter → phải $match thủ công
    const pipeline: PipelineStage[] = [
      // 1. Lọc theo org
      { $match: { organization: new Types.ObjectId(orgId) } },

      // 2. $facet — 3 luồng thống kê song song trong 1 query
      {
        $facet: {
          // Luồng 1: Số task theo trạng thái
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $project: { _id: 0, status: '$_id', count: 1 } },
          ],

          // Luồng 2: Số task theo độ ưu tiên
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $project: { _id: 0, priority: '$_id', count: 1 } },
          ],

          // Luồng 3: Workload per user ($unwind + $lookup trong $facet)
          byAssignee: [
            // $unwind: mỗi task-user pair -> 1 document
            {
              $unwind: {
                path: '$assignedTo',
                preserveNullAndEmptyArrays: false,
              },
            },
            // $lookup: lấy name + email từ collection 'users'
            {
              $lookup: {
                from: 'users',
                localField: 'assignedTo',
                foreignField: '_id',
                as: 'userInfo',
                pipeline: [{ $project: { name: 1, email: 1 } }],
              },
            },
            {
              $unwind: {
                path: '$userInfo',
                preserveNullAndEmptyArrays: true,
              },
            },
            // Group theo user: đếm số task được giao
            {
              $group: {
                _id: '$assignedTo',
                userName: { $first: '$userInfo.name' },
                email: { $first: '$userInfo.email' },
                taskCount: { $sum: 1 },
                statuses: { $push: '$status' },
              },
            },
            { $sort: { taskCount: -1 } },
            {
              $project: {
                _id: 0,
                userId: '$_id',
                userName: 1,
                email: 1,
                taskCount: 1,
                statuses: 1,
              },
            },
          ],
        },
      },
    ];

    const rows = await this.taskModel.aggregate(pipeline);
    const report = rows[0] as WorkloadReport | undefined;
    return report ?? { byStatus: [], byPriority: [], byAssignee: [] };
  }

  // Delete
  async delete(id: string, currentUser: TaskActor): Promise<{ message: string }> {
    await this.ensureTaskMutationAccess(id, currentUser);

    // Plugin tự filter: chỉ xóa task thuộc org hiện tại
    const result = await this.taskModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Task not found');
    return { message: 'Task deleted successfully' };
  }
}
