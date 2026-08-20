import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MembershipService } from './membership.service';
import { Membership, MembershipSchema } from './schemas/membership.schema';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
  providers: [MembershipService, TenantMembershipGuard],
  // Export cả service (dùng ở TenantInterceptor/auth) lẫn MongooseModule (nếu module khác
  // cần inject trực tiếp MembershipModel).
  exports: [MembershipService, TenantMembershipGuard, MongooseModule],
})
export class MembershipModule {}
