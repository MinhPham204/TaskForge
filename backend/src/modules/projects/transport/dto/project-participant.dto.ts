import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { ProjectRole } from '../../persistence/typeorm/project.entities';

export class AddPostgresProjectTeamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  teamId!: string;
}

export class AddPostgresProjectMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  organizationMembershipId!: string;

  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
