import {
  BadRequestException,
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

@ApiTags('PostgreSQL Task Attachments')
@ApiBearerAuth('accessToken')
@Controller('projects/:projectId/tasks/:taskId/attachments')
@UseGuards(PostgresJwtAuthGuard, PostgresTenantMembershipGuard)
@UseInterceptors(PostgresTenantInterceptor)
export class PostgresTaskAttachmentController {
  constructor(private readonly collaboration: PostgresCollaborationService) {}

  @Get()
  @ApiOperation({ summary: 'List active Task attachments' })
  @ApiOkResponse({ description: 'List of Task attachments' })
  list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.collaboration.listTaskAttachments(
      actor(request),
      projectId,
      taskId,
    );
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and attach a file to Task (active Project member)' })
  @ApiOkResponse({ description: 'File attached to Task' })
  async upload(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @UploadedFile() file: MulterFileLike | undefined,
    @Req() request: PostgresTenantRequest,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    return this.collaboration.uploadTaskAttachment(
      actor(request),
      projectId,
      taskId,
      {
        originalName: file.originalname,
        mediaType: file.mimetype,
        bytes: file.buffer,
      },
    );
  }

  @Get(':attachmentId/download')
  @ApiOperation({ summary: 'Download an active Task attachment' })
  async download(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' })) attachmentId: string,
    @Req() request: PostgresTenantRequest,
    @Res() res: Response,
  ) {
    const file = await this.collaboration.downloadTaskAttachment(
      actor(request),
      projectId,
      taskId,
      attachmentId,
    );
    res.setHeader('Content-Type', file.mediaType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    );
    res.setHeader('Content-Length', file.bytes.byteLength);
    res.end(file.bytes);
  }

  @Delete(':attachmentId')
  @ApiOperation({ summary: 'Soft unlink an attachment from Task' })
  @ApiOkResponse({ description: 'Task attachment unlinked' })
  unlink(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Param('attachmentId', new ParseUUIDPipe({ version: '4' })) attachmentId: string,
    @Req() request: PostgresTenantRequest,
  ) {
    return this.collaboration.unlinkTaskAttachment(
      actor(request),
      projectId,
      taskId,
      attachmentId,
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
