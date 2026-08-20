import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../user/schemas/user.schema';
import { Membership, MembershipDocument } from './schemas/membership.schema';

/**
 * MongoServerError duplicate-key code — trùng compound unique index (user, organization).
 */
const MONGO_DUPLICATE_KEY = 11000;

@Injectable()
export class MembershipService {
  constructor(
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
  ) {}

  /**
   * Tra cứu Membership của 1 user trong 1 org cụ thể.
   *
   * Đây là hàm lõi được `TenantInterceptor` (TASK-4) gọi để validate quyền truy cập org
   * trước khi set ALS context. Filter truyền `organization` tường minh, nên không phụ
   * thuộc vào tenant context (vốn CHƯA tồn tại tại thời điểm interceptor chạy).
   *
   * @param onlyActive true (default) → chỉ trả Membership đang active.
   */
  async findByUserAndOrg(
    userId: string,
    organizationId: string,
    onlyActive = true,
  ): Promise<MembershipDocument | null> {
    const filter: Record<string, unknown> = {
      user: new Types.ObjectId(userId),
      organization: new Types.ObjectId(organizationId),
    };
    if (onlyActive) {
      filter.isActive = true;
    }
    return this.membershipModel.findOne(filter);
  }

  /**
   * Danh sách tất cả Membership của 1 user (mặc định chỉ active), kèm thông tin org.
   * Dùng cho GET /auth/my-organizations (TASK-8).
   */
  async findByUser(
    userId: string,
    onlyActive = true,
  ): Promise<MembershipDocument[]> {
    const filter: Record<string, unknown> = {
      user: new Types.ObjectId(userId),
    };
    if (onlyActive) {
      filter.isActive = true;
    }
    return this.membershipModel
      .find(filter)
      .populate('organization', 'name slug logoUrl')
      .sort({ joinedAt: -1 });
  }

  async findById(id: string): Promise<MembershipDocument> {
    const membership = await this.membershipModel.findById(id);
    if (!membership) {
      throw new NotFoundException(`Membership with id "${id}" not found`);
    }
    return membership;
  }

  /**
   * Tạo Membership mới cho cặp (user, organization).
   * Dựa vào compound unique index để đảm bảo idempotency: nếu đã tồn tại → ConflictException
   * rõ ràng thay vì để lộ MongoServerError.
   */
  async create(
    userId: string,
    organizationId: string,
    role: UserRole = UserRole.MEMBER,
  ): Promise<MembershipDocument> {
    try {
      const membership = new this.membershipModel({
        user: new Types.ObjectId(userId),
        organization: new Types.ObjectId(organizationId),
        role,
      });
      return await membership.save();
    } catch (error) {
      if (
        error instanceof Error &&
        (error as { code?: number }).code === MONGO_DUPLICATE_KEY
      ) {
        throw new ConflictException(
          'User already has a membership in this organization',
        );
      }
      throw error;
    }
  }

  async updateRole(id: string, role: UserRole): Promise<MembershipDocument> {
    const membership = await this.membershipModel.findByIdAndUpdate(
      id,
      { $set: { role } },
      { new: true },
    );
    if (!membership) {
      throw new NotFoundException(`Membership with id "${id}" not found`);
    }
    return membership;
  }

  /**
   * Bật/tắt Membership. Set isActive=false để thu hồi quyền truy cập org của user
   * mà không xóa lịch sử (soft-revoke).
   */
  async setActive(id: string, isActive: boolean): Promise<MembershipDocument> {
    const membership = await this.membershipModel.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true },
    );
    if (!membership) {
      throw new NotFoundException(`Membership with id "${id}" not found`);
    }
    return membership;
  }

  async delete(id: string): Promise<{ message: string }> {
    const result = await this.membershipModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`Membership with id "${id}" not found`);
    }
    return { message: 'Membership deleted successfully' };
  }
}
