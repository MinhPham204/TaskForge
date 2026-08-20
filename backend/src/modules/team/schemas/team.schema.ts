import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';

export type TeamDocument = HydratedDocument<Team>;

export enum TeamMemberRole {
  LEAD = 'TEAM_LEAD',
  MEMBER = 'TEAM_MEMBER',
}

// Team Member Subdocument
@Schema({ _id: false })
export class TeamMember {
  @ApiProperty({ type: 'string', example: '69d0f8dcbb246f2d11895ca7' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @ApiProperty({ enum: TeamMemberRole, default: TeamMemberRole.MEMBER })
  @Prop({
    type: String,
    enum: Object.values(TeamMemberRole),
    required: true,
    default: TeamMemberRole.MEMBER,
  })
  role!: TeamMemberRole;
}
export const TeamMemberSchema = SchemaFactory.createForClass(TeamMember);

// Pending Invitation Subdocument
@Schema({ _id: false })
export class PendingInvitation {
  @ApiProperty()
  @Prop({ type: String, required: true })
  email!: string;

  @ApiProperty({ enum: TeamMemberRole, default: TeamMemberRole.MEMBER })
  @Prop({
    type: String,
    enum: Object.values(TeamMemberRole),
    default: TeamMemberRole.MEMBER,
  })
  role!: TeamMemberRole;

  @ApiProperty({ example: '4b7f0f2f0c8e41d89f8f4b95a9b1dbdf' })
  @Prop({ type: String, required: true })
  token!: string;

  @ApiProperty({ example: '2026-04-20T10:00:00.000Z' })
  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}
export const PendingInvitationSchema =
  SchemaFactory.createForClass(PendingInvitation);

// Main Team Schema
@Schema({ timestamps: true })
export class Team {
  @Prop({
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
  })
  name!: string;

  @Prop({ type: String, trim: true, default: '' })
  description!: string;

  @Prop({ type: String, default: null })
  logoUrl!: string | null;

  @Prop({ type: [TeamMemberSchema], default: [] })
  members!: TeamMember[];

  @Prop({ type: [PendingInvitationSchema], default: [] })
  pendingInvitations!: PendingInvitation[];

  /**
   * Bật/tắt yêu cầu phê duyệt khi task chuyển sang COMPLETED.
   * Team tạo trước khi có field này sẽ nhận default `true` khi Mongoose hydrate document
   * (không cần migration thủ công).
   */
  @ApiProperty({ default: true })
  @Prop({ type: Boolean, default: true })
  requireApproval!: boolean;

  /** Tự động inject bởi TenantPlugin, không truyền thủ công */
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organization!: Types.ObjectId;

}

export const TeamSchema = SchemaFactory.createForClass(Team);

// Tối ưu prefix organization
TeamSchema.index({ organization: 1, name: 1 }, { unique: true });

// Tối ưu cho API lấy danh sách toàn bộ team có sort
TeamSchema.index({ organization: 1, createdAt: -1 });

// Tối ưu cho API getMyTeams (tìm team mà user đang là thành viên)
// TeamSchema.index({ organization: 1, "members.user": 1 });

