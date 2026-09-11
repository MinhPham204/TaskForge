import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PostgresJwtAuthGuard } from '../../onboarding/tenant/jwt-auth.guard';
import { PostgresTenantInterceptor } from '../../onboarding/tenant/tenant.interceptor';
import {
  PostgresTenantMembershipGuard,
  type PostgresTenantRequest,
} from '../../onboarding/tenant/tenant-membership.guard';
import { PostgresCollaborationService } from '../application/collaboration.service';

interface MulterFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('PostgreSQL Project Files')
@ApiBearerAuth('accessToken')
@Controller('projects/:projectId/files')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresProjectFileController {
  constructor(private readonly collaboration: PostgresCollaborationService) {}

  @Get()
  @ApiOperation({ summary: 'List active Project files' })
  @ApiOkResponse({ description: 'List of Project files' })
  list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.collaboration.listProjectFiles(actor(request), projectId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and add a file to Project (Project Manager only, FILES module enabled)' })
  @ApiOkResponse({ description: 'File added to Project' })
  async upload(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @UploadedFile() file: MulterFileLike | undefined,
    @Body('displayName') displayName: string | undefined,
    @Req() request: PostgresTenantRequest,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    return this.collaboration.uploadProjectFile(
      actor(request),
      projectId,
      {
        originalName: file.originalname,
        mediaType: file.mimetype,
        bytes: file.buffer,
      },
      displayName,
    );
  }

  @Get(':projectFileId/download')
  @ApiOperation({ summary: 'Download an active Project file' })
  async download(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('projectFileId', new ParseUUIDPipe({ version: '4' })) projectFileId: string,
    @Req() request: PostgresTenantRequest,
    @Res() res: Response,
  ) {
    const file = await this.collaboration.downloadProjectFile(
      actor(request),
      projectId,
      projectFileId,
    );
    res.setHeader('Content-Type', file.mediaType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    );
    res.setHeader('Content-Length', file.bytes.byteLength);
    res.end(file.bytes);
  }

  @Delete(':projectFileId')
  @ApiOperation({ summary: 'Soft remove a file from Project (Project Manager only)' })
  @ApiOkResponse({ description: 'Project file removed' })
  remove(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('projectFileId', new ParseUUIDPipe({ version: '4' })) projectFileId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.collaboration.removeProjectFile(
      actor(request),
      projectId,
      projectFileId,
    );
  }
}

function actor(request: PostgresTenantRequest) {
  if (!request.postgresTenant) {
    throw new Error('Verified PostgreSQL tenant context is required');
  }
  return {
    organizationId: request.postgresTenant.organizationId,
    membershipId: request.postgresTenant.id,
  };
}
