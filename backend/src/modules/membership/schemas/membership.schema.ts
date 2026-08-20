import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../user/schemas/user.schema';

export type MembershipDocument = HydratedDocument<Membership>;

/**
 * Membership — quan hệ N-N giữa User và Organization.
 *
 * Đây là NGUỒN XÁC THỰC TENANCY của hệ thống (Constitution — Nguyên tắc 1):
 * một user có thể thuộc nhiều organization, và `role` là thuộc tính THEO TỪNG org
 * (org-scoped) chứ không còn là field toàn cục trên `User`.
 *
 * Vì bản thân collection này span nhiều org, nó KHÔNG được `tenantPlugin` filter
 * theo `organization` (đã thêm 'Membership' vào excludedModels của plugin).
 */
@Schema({ timestamps: true })
export class Membership {
  @ApiProperty({ type: 'string', example: '69d0f8dcbb246f2d11895ca7' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @ApiProperty({ type: 'string', example: '69d0f8dcbb246f2d11895cb2' })
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organization!: Types.ObjectId;

  @ApiProperty({ enum: UserRole, default: UserRole.MEMBER })
  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.MEMBER,
  })
  role!: UserRole;

  @ApiProperty({ default: true })
  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-07-06T10:00:00.000Z' })
  @Prop({ type: Date, default: () => new Date() })
  joinedAt!: Date;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);

// 1 user chỉ có duy nhất 1 Membership trong mỗi organization.
MembershipSchema.index({ user: 1, organization: 1 }, { unique: true });

// Tối ưu cho query "danh sách org đang active của 1 user" (GET /auth/my-organizations).
MembershipSchema.index({ user: 1, isActive: 1 });
