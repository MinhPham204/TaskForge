import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEmail, IsIn, IsOptional } from 'class-validator';

export class CreatePostgresInvitationDto {
  @ApiProperty({ example: 'member@example.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '2026-10-04T00:00:00.000Z', format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  expiresAt!: Date;

  @ApiPropertyOptional({ enum: ['ADMIN', 'MEMBER'], default: 'MEMBER' })
  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  role?: 'ADMIN' | 'MEMBER';
}
