import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEmail, IsOptional, IsUUID } from 'class-validator';

export class CreatePostgresInvitationDto {
  @ApiProperty({ example: 'member@example.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '2026-10-04T00:00:00.000Z', format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  expiresAt!: Date;

  @ApiPropertyOptional({ format: 'uuid', description: 'Organization-scoped non-Owner role; defaults to the Organization MEMBER role.' })
  @IsOptional()
  @IsUUID('4')
  roleId?: string;
}
