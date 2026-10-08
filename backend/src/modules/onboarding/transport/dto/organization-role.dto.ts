import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOrganizationRoleDto {
  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @ArrayMaxSize(64) @IsString({ each: true }) permissionCodes!: string[];
}

export class UpdateOrganizationRoleDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number;
}

export class ReplaceOrganizationRolePermissionsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @ArrayMaxSize(64) @IsString({ each: true }) permissionCodes!: string[];
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number;
}

export class OrganizationRoleVersionDto {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number;
}

export class AssignOrganizationRoleDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') roleId!: string;
}
