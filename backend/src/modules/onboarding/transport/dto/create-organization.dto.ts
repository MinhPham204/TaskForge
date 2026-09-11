import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePostgresOrganizationDto {
  @ApiProperty({ example: 'Acme Studio', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.test/acme.png',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string | null;
}
