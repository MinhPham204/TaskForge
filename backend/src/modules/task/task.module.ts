import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { Task, TaskSchema } from './schemas/task.schema';
import { Team, TeamSchema } from '../team/schemas/team.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { NOTIFICATION_QUEUE } from '../automation/constants/queues';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Team.name, schema: TeamSchema }, // Để validate team trong cùng org
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
    }),
    MembershipModule,
  ],
  controllers: [TaskController],
  providers: [TaskService, OrgAdminGuard],
  exports: [TaskService, MongooseModule],
})
export class TaskModule {}
