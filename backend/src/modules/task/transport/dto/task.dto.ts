import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePostgresTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  owningTeamId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  statusId!: string;

  @ApiProperty({ example: 'Prepare launch checklist' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiProperty({ example: 'MEDIUM' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  priorityCode!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Optional open Milestone in the same Project',
  })
  @IsOptional()
  @IsUUID('4')
  milestoneId?: string | null;
}

export class UpdatePostgresTaskDto {
  @ApiPropertyOptional({ example: 'Prepare launch checklist' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  owningTeamId?: string;

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  priorityCode?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Optional open Milestone in the same Project',
  })
  @IsOptional()
  @IsUUID('4')
  milestoneId?: string | null;
}

export class AssignPostgresTaskDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  projectMembershipId!: string;
}

export class TransitionPostgresTaskStatusDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  statusId!: string;
}

export class SetPostgresTaskManualProgressDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  manualProgress!: number;
}

export class AddPostgresTaskChecklistItemDto {
  @ApiProperty({ example: 'Confirm release notes' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;
}

export class SetPostgresTaskChecklistItemCompletionDto {
  @ApiProperty()
  @IsBoolean()
  completed!: boolean;
}

export class CreatePostgresCommentDto {
  @ApiProperty({ example: 'Please verify the release note.' })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class UpdatePostgresCommentDto extends CreatePostgresCommentDto {}

export class ConfigurePostgresTaskApprovalDto {
  @IsOptional() @IsUUID('4') approverProjectMembershipId?: string | null;
}
export class ResolvePostgresTaskApprovalDto {
  @IsOptional() @IsString() @MaxLength(10000) reason?: string;
}

export class PostgresTaskQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive title or description search' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  statusId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  teamId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  assigneeProjectMembershipId?: string;

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  priorityCode?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueTo?: string;
}
