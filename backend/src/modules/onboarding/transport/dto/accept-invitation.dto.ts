import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AcceptPostgresInvitationDto {
  @ApiProperty({
    description: 'Opaque invitation credential received by email',
  })
  @IsString()
  @MinLength(20)
  token!: string;
}
