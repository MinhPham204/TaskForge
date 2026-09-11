import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import { PostgresTenantMembershipGuard, type PostgresTenantRequest } from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresMilestoneService } from '../application/milestone.service';
class MilestoneDto { @IsString() @MinLength(1) @MaxLength(500) name!: string; @IsOptional() @IsString() @MaxLength(10000) description?: string; @IsDateString() dueDate!: string; }
class UpdateMilestoneDto { @IsOptional() @IsString() @MinLength(1) @MaxLength(500) name?: string; @IsOptional() @IsString() @MaxLength(10000) description?: string; @IsOptional() @IsDateString() dueDate?: string; }
@Controller('projects/:projectId/milestones') @UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard) @UseInterceptors(PostgresTenantInterceptor)
export class PostgresMilestoneController {
  constructor(private readonly milestones: PostgresMilestoneService) {}
  @Get() list(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Req() request: PostgresTenantRequest) { return this.milestones.list(actor(request), projectId); }
  @Post() create(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Body() dto: MilestoneDto, @Req() request: PostgresTenantRequest) { return this.milestones.create(actor(request), projectId, dto); }
  @Patch(':milestoneId') update(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('milestoneId', new ParseUUIDPipe({ version: '4' })) milestoneId: string, @Body() dto: UpdateMilestoneDto, @Req() request: PostgresTenantRequest) { return this.milestones.update(actor(request), projectId, milestoneId, dto); }
  @Post(':milestoneId/close') close(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('milestoneId', new ParseUUIDPipe({ version: '4' })) milestoneId: string, @Req() request: PostgresTenantRequest) { return this.milestones.close(actor(request), projectId, milestoneId); }
  @Post(':milestoneId/reopen') reopen(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string, @Param('milestoneId', new ParseUUIDPipe({ version: '4' })) milestoneId: string, @Req() request: PostgresTenantRequest) { return this.milestones.reopen(actor(request), projectId, milestoneId); }
}
function actor(request: PostgresTenantRequest) { if (!request.postgresTenant) throw new Error('Verified PostgreSQL tenant context is required'); return { organizationId: request.postgresTenant.organizationId, membershipId: request.postgresTenant.id }; }
