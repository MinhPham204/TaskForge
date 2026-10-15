import React from 'react';
import { useGetTaskAttachmentsQuery, useUploadTaskAttachmentMutation, useUnlinkTaskAttachmentMutation, downloadTaskAttachment } from '../../services/collaborationApi.js';
import { getTaskCapability } from '../../utils/taskCapabilities.js';
import { editorReason } from '../../utils/taskEditor.js';
import FilePanel from './FilePanel.jsx';
import useFileOperations from './useFileOperations.js';
export default function TaskAttachments({ projectId, task }) {
  const taskId = task.id, queryArgs = { projectId, taskId };
  const { currentData: files = [], isLoading, isFetching, isError, error, refetch } = useGetTaskAttachmentsQuery(queryArgs, { refetchOnMountOrArgChange: true });
  const [upload] = useUploadTaskAttachmentMutation();
  const [unlink] = useUnlinkTaskAttachmentMutation();
  const uploadAccess = getTaskCapability(task, 'uploadAttachment'), unlinkAccess = getTaskCapability(task, 'unlinkAttachment');
  const access = { uploadAllowed: uploadAccess.allowed, unlinkAllowed: unlinkAccess.allowed, readAllowed: getTaskCapability(task, 'readAttachments').allowed };
  const session = useFileOperations({ ...access, queryName: 'getTaskAttachments', queryArgs, refetch,
    upload: file => { const formData = new FormData(); formData.append('file', file); return upload({ projectId, taskId, formData }).unwrap(); },
    unlink: file => unlink({ projectId, taskId, attachmentId: file.id }).unwrap(),
    download: (file, isCurrent) => downloadTaskAttachment(projectId, taskId, file.id, file.originalName, { isCurrent }),
  });
  return <FilePanel title="Attachments" files={files} loading={isLoading || (isFetching && !files.length)} fetching={isFetching} error={isError ? error : null} {...access} reason={editorReason(uploadAccess.reason || unlinkAccess.reason)} {...session} />;
}
