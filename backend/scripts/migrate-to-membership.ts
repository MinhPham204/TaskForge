/**
 * Migration (Phase 2 — TASK-2): Tạo `Membership` từ `User.organization` hiện có.
 *
 * NGUYÊN TẮC AN TOÀN:
 * - KHÔNG xóa/động vào field `User.organization` hay `User.team` (việc đó là TASK-3,
 *   chỉ chạy SAU khi migration này được xác nhận đúng).
 * - Idempotent: chạy nhiều lần không tạo bản ghi trùng — dựa vào compound unique index
 *   (user, organization) + upsert `$setOnInsert` (atomic, Constitution — Nguyên tắc 2).
 * - Hỗ trợ `--dry-run`: chỉ đọc & in báo cáo, KHÔNG ghi gì vào DB.
 *
 * Chạy:
 *   npm run migrate:membership -- --dry-run   # xem trước, không ghi
 *   npm run migrate:membership                # thực thi
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model, Types } from 'mongoose';
import {
  User,
  UserDocument,
  UserRole,
  UserSchema,
} from '../src/modules/user/schemas/user.schema';
import {
  Organization,
  OrganizationDocument,
  OrganizationSchema,
} from '../src/modules/organization/schemas/organization.schema';
import {
  Membership,
  MembershipDocument,
  MembershipSchema,
} from '../src/modules/membership/schemas/membership.schema';

/**
 * Module bootstrap tối thiểu cho migration — CHỈ kết nối MongoDB.
 * Cố ý KHÔNG dùng AppModule để tránh kéo theo BullMQ/Redis, ScheduleModule (cron)...
 * những thứ một migration không cần và sẽ làm script không chạy được standalone.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
})
class MigrationModule {}

const DRY_RUN = process.argv.includes('--dry-run');

/** Projection tối thiểu của User (lean) mà migration cần đọc. */
interface LeanUser {
  _id: Types.ObjectId;
  organization: Types.ObjectId | null;
  role?: UserRole;
  isActive?: boolean;
  createdAt?: Date; // do timestamps:true sinh ra ở runtime, không có trên class User
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MigrationModule, {
    logger: ['error'],
  });

  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const orgModel = app.get<Model<OrganizationDocument>>(
    getModelToken(Organization.name),
  );
  const membershipModel = app.get<Model<MembershipDocument>>(
    getModelToken(Membership.name),
  );

  try {
    console.log(
      `\n=== Migrate User.organization -> Membership ${
        DRY_RUN ? '(DRY-RUN, không ghi DB)' : '(THỰC THI)'
      } ===\n`,
    );

    // 1. Map orgId -> ownerUserId để không hạ cấp owner xuống member khi role toàn cục
    //    của user chưa phản ánh đúng (Constitution — Nguyên tắc 3: role org-scoped).
    const orgs = await orgModel
      .find({}, { _id: 1, owner: 1 })
      .lean<{ _id: Types.ObjectId; owner?: Types.ObjectId }[]>();
    const ownerByOrg = new Map<string, string>();
    for (const org of orgs) {
      if (org.owner) {
        ownerByOrg.set(org._id.toString(), org.owner.toString());
      }
    }

    // 2. Lấy toàn bộ user CÓ organization (field cũ vẫn còn ở Phase này).
    const users = await userModel
      .find(
        { organization: { $ne: null } },
        { organization: 1, role: 1, isActive: 1, createdAt: 1 },
      )
      .lean<LeanUser[]>();

    const totalUsers = await userModel.countDocuments({});
    const usersWithoutOrg = totalUsers - users.length;

    // 3. Nạp sẵn các Membership đã tồn tại để phân loại chính xác created vs existing.
    const existingDocs = await membershipModel
      .find({}, { user: 1, organization: 1 })
      .lean<{ user: Types.ObjectId; organization: Types.ObjectId }[]>();
    const existingKeys = new Set<string>();
    for (const m of existingDocs) {
      existingKeys.add(`${m.user.toString()}::${m.organization.toString()}`);
    }

    // 4. Dựng bulk upsert ops (idempotent).
    const ops: AnyBulkWriteOperation<MembershipDocument>[] = [];
    let willCreate = 0;
    let alreadyExists = 0;

    for (const user of users) {
      const userId = user._id;
      const orgId = user.organization;
      if (!orgId) continue; // an toàn: filter đã loại null, đây chỉ là narrowing
      const key = `${userId.toString()}::${orgId.toString()}`;

      if (existingKeys.has(key)) {
        alreadyExists++;
        continue;
      }

      const isOwner = ownerByOrg.get(orgId.toString()) === userId.toString();
      const role = isOwner ? UserRole.OWNER : (user.role ?? UserRole.MEMBER);

      ops.push({
        updateOne: {
          filter: { user: userId, organization: orgId },
          update: {
            $setOnInsert: {
              user: userId,
              organization: orgId,
              role,
              isActive: user.isActive ?? true,
              joinedAt: user.createdAt ?? new Date(),
            },
          },
          upsert: true,
        },
      });
      willCreate++;
    }

    // 5. Báo cáo trước khi ghi.
    console.log(`Tổng số user:                 ${totalUsers}`);
    console.log(`  - Có organization:          ${users.length}`);
    console.log(`  - Không có org (bỏ qua):    ${usersWithoutOrg}`);
    console.log(`Membership đã tồn tại:        ${alreadyExists}`);
    console.log(`Membership sẽ tạo mới:        ${willCreate}\n`);

    if (DRY_RUN) {
      console.log(
        'DRY-RUN: không ghi gì vào DB. Xem lại số liệu ở trên rồi chạy lại không kèm --dry-run.\n',
      );
      return;
    }

    if (ops.length === 0) {
      console.log(
        'Không có Membership nào cần tạo — DB đã ở trạng thái mong muốn.\n',
      );
      return;
    }

    const result = await membershipModel.bulkWrite(ops, { ordered: false });
    console.log('=== KẾT QUẢ GHI ===');
    console.log(`Đã tạo mới (upserted):        ${result.upsertedCount}`);
    console.log(`Khớp bản ghi có sẵn (matched): ${result.matchedCount}`);
    console.log(
      '\nHoàn tất. LƯU Ý: field User.organization/User.team CHƯA bị xóa (đúng thiết kế — để TASK-3 xử lý sau khi review).\n',
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Migration thất bại:', error);
  process.exit(1);
});
