import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsBoolean, IsEnum } from 'class-validator';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresProjectModuleService } from '../application/project-module.service';
import { PostgresProjectReadService } from '../application/project-read.service';
import { ProjectModuleCode } from '../persistence/typeorm/project.entities';
class ModuleDto {
  @IsEnum(ProjectModuleCode) moduleCode!: ProjectModuleCode;
  @IsBoolean() enabled!: boolean;
}
@Controller('projects/:projectId/modules')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresProjectModuleController {
  constructor(
    private readonly modules: PostgresProjectModuleService,
    private readonly reads: PostgresProjectReadService,
  ) {}
  @Get() list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    if (!request.postgresTenant)
      throw new Error('Verified PostgreSQL tenant context is required');
    return this.reads.listModules(
      {
        organizationId: request.postgresTenant.organizationId,
        membershipId: request.postgresTenant.id,
      },
      projectId,
    );
  }
  @Post() set(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() dto: ModuleDto,
    @Req() request: PostgresTenantRequest,
  ) {
    if (!request.postgresTenant)
      throw new Error('Verified PostgreSQL tenant context is required');
    return this.modules.setEnabled(
      {
        organizationId: request.postgresTenant.organizationId,
        membershipId: request.postgresTenant.id,
      },
      projectId,
      dto.moduleCode,
      dto.enabled,
    );
  }
}
