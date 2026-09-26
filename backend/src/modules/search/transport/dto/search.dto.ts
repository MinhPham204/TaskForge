import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PostgresGlobalSearchQueryDto {
  @ApiProperty({ description: 'Case-insensitive Project, Task, or Team search' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  query!: string;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
