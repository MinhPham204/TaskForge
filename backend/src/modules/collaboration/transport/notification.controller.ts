import { Controller, Get, Param, Patch, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostgresNotificationService } from '../application/notification.service';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import { PostgresTenantMembershipGuard, type PostgresTenantRequest } from '../../onboarding/tenant/tenant-membership.guard';

@ApiTags('PostgreSQL notifications')
@ApiBearerAuth('accessToken')
@Controller('notifications')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresNotificationController {
  constructor(private readonly notifications: PostgresNotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List the active member inbox for the selected workspace' })
  list(@Req() request: PostgresTenantRequest) {
    return this.notifications.listInbox(actor(request));
  }

  @Patch(':notificationId/read')
  @ApiOkResponse({ description: 'Notification marked read' })
  markRead(@Param('notificationId') notificationId: string, @Req() request: PostgresTenantRequest) {
    return this.notifications.markRead(actor(request), notificationId);
  }

  @Patch(':notificationId/unread')
  @ApiOkResponse({ description: 'Notification marked unread' })
  markUnread(@Param('notificationId') notificationId: string, @Req() request: PostgresTenantRequest) {
    return this.notifications.markUnread(actor(request), notificationId);
  }
}

function actor(request: PostgresTenantRequest) {
  if (!request.postgresTenant) throw new Error('Verified PostgreSQL tenant context is required');
  return {
    organizationId: request.postgresTenant.organizationId,
    membershipId: request.postgresTenant.id,
  };
}
