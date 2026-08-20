import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrgOwnerGuard } from './guards/org-owner.guard';
import { OrgAdminGuard } from './guards/org-admin.guard';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import { UserModule } from '../user/user.module';
import { SharedModule } from '../../common/shared.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
    ]),
    UserModule, // Để OrganizationService inject UserModel và update user.organization
    SharedModule, // Để inject EmailService
    MembershipModule,
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrgOwnerGuard, OrgAdminGuard],
  exports: [OrganizationService, MongooseModule],
})
export class OrganizationModule {}
