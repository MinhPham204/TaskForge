import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

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
