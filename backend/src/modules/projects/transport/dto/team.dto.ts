import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostgresTeamDto {
  @ApiProperty({ example: 'Product' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Product delivery team' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.test/team.png',
    nullable: true,
  })
  @IsOptional()
  @IsUrl()
  logoUrl?: string | null;
}

export class UpdatePostgresTeamDto {
  @ApiPropertyOptional({ example: 'Product Engineering' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Product delivery team' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.test/team.png',
    nullable: true,
  })
  @IsOptional()
  @IsUrl()
  logoUrl?: string | null;
}

export class AddPostgresTeamMemberDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Active Organization Membership ID',
  })
  @IsUUID('4')
  organizationMembershipId!: string;
}
