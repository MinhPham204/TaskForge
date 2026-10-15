import React from 'react';
import { useGetProjectFilesQuery, useUploadProjectFileMutation, useRemoveProjectFileMutation, downloadProjectFile } from '../../../services/collaborationApi';
import { useGetProjectByIdQuery, useGetProjectModulesQuery } from '../../../services/projectApi';
import FilePanel from '../../../components/task/FilePanel.jsx';
import useFileOperations from '../../../components/task/useFileOperations.js';

export default function ProjectFilesTab({ projectId }) {
  const { currentData: files = [], isLoading, isFetching, isError, error, refetch } = useGetProjectFilesQuery(projectId, { refetchOnMountOrArgChange: true });
  const { currentData: project } = useGetProjectByIdQuery(projectId);
  const { currentData: modules = [] } = useGetProjectModulesQuery(projectId);
  const [upload] = useUploadProjectFileMutation();
  const [remove] = useRemoveProjectFileMutation();
  const mutable = ['DRAFT', 'ACTIVE'].includes(project?.state);
  const manager = project?.viewer?.canManage === true;
  const enabled = modules.some(module => module.moduleCode === 'FILES' && module.enabled);
  const access = { uploadAllowed: mutable && manager && enabled, unlinkAllowed: mutable && manager, readAllowed: Boolean(project) };
  const reason = !mutable ? 'This Project is read-only or permissions are still loading.' : !manager ? 'Only an active Project Manager can change Project files.' : 'Enable the FILES module before uploading Project files. Existing files remain readable.';
  const session = useFileOperations({ ...access, queryName: 'getProjectFiles', queryArgs: projectId, refetch,
    upload: (file, displayName) => { const formData = new FormData(); formData.append('file', file); if (displayName.trim()) formData.append('displayName', displayName.trim()); return upload({ projectId, formData }).unwrap(); },
    unlink: file => remove({ projectId, fileId: file.id }).unwrap(),
    download: (file, isCurrent) => downloadProjectFile(projectId, file.id, file.displayName || file.originalName, { isCurrent }),
  });
  return <FilePanel title="Project Files" projectFiles files={files} loading={isLoading || (isFetching && !files.length)} fetching={isFetching} error={isError ? error : null} {...access} reason={reason} {...session} />;
}
