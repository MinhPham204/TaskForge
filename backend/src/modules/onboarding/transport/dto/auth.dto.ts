import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

const SUPPORTED_TIMEZONES = ['UTC', 'Asia/Ho_Chi_Minh', 'Asia/Tokyo', 'Europe/London', 'America/New_York'];
const SUPPORTED_LOCALES = ['en-US', 'vi-VN', 'ja-JP'];

export class PostgresRegisterDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email!: string;
}

export class PostgresVerifyOtpDto extends PostgresRegisterDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otp!: string;
}

export class PostgresCompleteSignupDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  profileImageUrl?: string;
}

export class PostgresLoginDto extends PostgresRegisterDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class UpdatePostgresProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl()
  profileImageUrl?: string | null;
}

export class ChangePostgresPasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword!: string;
}

export class UpdatePostgresPersonalPreferencesDto {
  @ApiProperty({ enum: SUPPORTED_TIMEZONES })
  @IsString()
  @IsIn(SUPPORTED_TIMEZONES)
  timezone!: string;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsString()
  @IsIn(SUPPORTED_LOCALES)
  locale!: string;

  @ApiProperty({ enum: [0, 1], description: '0 is Sunday and 1 is Monday' })
  @IsIn([0, 1])
  weekStartsOn!: number;

  @ApiProperty()
  @IsBoolean()
  inAppNotificationsEnabled!: boolean;
}
