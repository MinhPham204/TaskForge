import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { Team, TeamSchema } from './schemas/team.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { TeamLeadGuard } from './guards/team-lead.guard';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Team.name, schema: TeamSchema },
      { name: User.name, schema: UserSchema }, // Để validate member org membership
    ]),
    MembershipModule,
  ],
  controllers: [TeamController],
  providers: [TeamService, TeamLeadGuard, OrgAdminGuard],
  exports: [TeamService, MongooseModule],
})
export class TeamModule {}
