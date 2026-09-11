import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresProjectStatusService } from '../application/project-status.service';
import { PostgresProjectReadService } from '../application/project-read.service';
import { TaskStatusSemanticCategory } from '../persistence/typeorm/project.entities';
class CreateStatusDto {
  @IsString() name!: string;
  @IsEnum(TaskStatusSemanticCategory)
  semanticCategory!: TaskStatusSemanticCategory;
}
class RenameStatusDto {
  @IsString() name!: string;
}
class ReorderStatusDto {
  @IsInt() @Min(0) position!: number;
}
@ApiTags('PostgreSQL project statuses')
@ApiBearerAuth('accessToken')
@Controller('projects/:projectId/statuses')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresProjectStatusController {
  constructor(
    private readonly statuses: PostgresProjectStatusService,
    private readonly reads: PostgresProjectReadService,
  ) {}
  @Get()
  @ApiOperation({
    summary: 'List active Project task statuses in position order',
  })
  list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.reads.listStatuses(actor(request), projectId);
  }
  @Post() @ApiOperation({ summary: 'Create a Project task status' }) create(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() dto: CreateStatusDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.statuses.create(
      actor(request),
      projectId,
      dto.name,
      dto.semanticCategory,
    );
  }
  @Patch(':statusId')
  @ApiOperation({ summary: 'Rename a Project task status' })
  rename(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('statusId', new ParseUUIDPipe({ version: '4' })) statusId: string,
    @Body() dto: RenameStatusDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.statuses.rename(actor(request), projectId, statusId, dto.name);
  }
  @Post(':statusId/reorder') reorder(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('statusId', new ParseUUIDPipe({ version: '4' })) statusId: string,
    @Body() dto: ReorderStatusDto,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.statuses.reorder(
      actor(request),
      projectId,
      statusId,
      dto.position,
    );
  }
  @Post(':statusId/archive') archive(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('statusId', new ParseUUIDPipe({ version: '4' })) statusId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.statuses.archive(actor(request), projectId, statusId);
  }
}
function actor(request: PostgresTenantRequest) {
  if (!request.postgresTenant)
    throw new Error('Verified PostgreSQL tenant context is required');
  return {
    organizationId: request.postgresTenant.organizationId,
    membershipId: request.postgresTenant.id,
  };
}
