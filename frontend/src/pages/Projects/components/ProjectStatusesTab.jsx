import React, { useState } from 'react';
import {
  LuPlus,
  LuPencil,
  LuArchive,
  LuArrowUp,
  LuArrowDown,
  LuSettings,
  LuLock,
} from 'react-icons/lu';
import Modal from '../../../components/common/Modal';
import { EmptyState } from '../../../components/common/PageState';
import {
  useCreateProjectStatusMutation,
  useRenameProjectStatusMutation,
  useReorderProjectStatusMutation,
  useArchiveProjectStatusMutation,
  useGetProjectStatusesQuery,
} from '../../../services/projectApi';

const categoryBadgeClasses = {
  NOT_STARTED: 'bg-gray-100 text-gray-700 border-gray-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  REVIEW: 'bg-violet-50 text-violet-700 border-violet-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

const ProjectStatusesTab = ({
  projectId,
  canManage,
}) => {
  const { data: projectStatuses = [], isLoading, isError, error, refetch } = useGetProjectStatusesQuery(projectId);
  const [createProjectStatus, { isLoading: isCreatingStatus }] = useCreateProjectStatusMutation();
  const [renameProjectStatus, { isLoading: isRenamingStatus }] = useRenameProjectStatusMutation();
  const [reorderProjectStatus, { isLoading: isReorderingStatus }] = useReorderProjectStatusMutation();
  const [archiveProjectStatus, { isLoading: isArchivingStatus }] = useArchiveProjectStatusMutation();

  // Create status modal
  const [isCreateStatusOpen, setIsCreateStatusOpen] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusCategory, setNewStatusCategory] = useState('IN_PROGRESS');
  const [createStatusError, setCreateStatusError] = useState('');

  // Rename status modal
  const [statusToRename, setStatusToRename] = useState(null);
  const [renamedStatusName, setRenamedStatusName] = useState('');
  const [renameStatusError, setRenameStatusError] = useState('');

  // Archive status modal
  const [statusToArchive, setStatusToArchive] = useState(null);
  const [archiveStatusError, setArchiveStatusError] = useState('');

  const handleCreateStatusSubmit = async (e) => {
    e.preventDefault();
    setCreateStatusError('');
    const trimmed = newStatusName.trim();
    if (!trimmed) {
      setCreateStatusError('Status name is required');
      return;
    }
    try {
      await createProjectStatus({
        projectId,
        name: trimmed,
        semanticCategory: newStatusCategory,
      }).unwrap();
      setIsCreateStatusOpen(false);
      setNewStatusName('');
    } catch (err) {
      setCreateStatusError(err?.data?.message || err?.message || 'Failed to create status');
    }
  };

  const handleRenameStatusSubmit = async (e) => {
    e.preventDefault();
    if (!statusToRename) return;
    setRenameStatusError('');
    const trimmed = renamedStatusName.trim();
    if (!trimmed) {
      setRenameStatusError('Status name is required');
      return;
    }
    try {
      await renameProjectStatus({
        projectId,
        statusId: statusToRename.id,
        name: trimmed,
      }).unwrap();
      setStatusToRename(null);
    } catch (err) {
      setRenameStatusError(err?.data?.message || err?.message || 'Failed to rename status');
    }
  };

  const handleReorderStatus = async (statusId, currentPosition, direction) => {
    const targetPosition = direction === 'up' ? currentPosition - 1 : currentPosition + 1;
    if (targetPosition < 0 || targetPosition >= projectStatuses.length) return;
    try {
      await reorderProjectStatus({
        projectId,
        statusId,
        position: targetPosition,
      }).unwrap();
    } catch (err) {
      alert(err?.data?.message || err?.message || 'Failed to reorder status');
    }
  };

  const handleArchiveStatusConfirm = async () => {
    if (!statusToArchive) return;
    setArchiveStatusError('');
    try {
      await archiveProjectStatus({
        projectId,
        statusId: statusToArchive.id,
      }).unwrap();
      setStatusToArchive(null);
    } catch (err) {
      setArchiveStatusError(err?.data?.message || err?.message || 'Failed to archive status');
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-6 shadow-xs">
      <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Configured Task Statuses</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ordered sequence of task workflow states scoped specifically to this project.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setNewStatusName('');
              setNewStatusCategory('IN_PROGRESS');
              setCreateStatusError('');
              setIsCreateStatusOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
          >
            <LuPlus className="w-3.5 h-3.5" />
            Add Status
          </button>
        )}
      </div>

      {!canManage && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600 flex items-center gap-2">
          <LuLock className="w-4 h-4 text-gray-400 shrink-0" />
          <span>Project Manager authorization is required to modify project task statuses.</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading configured statuses...</p>
      ) : isError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <p>{error?.data?.message || 'Unable to load project statuses.'}</p>
          <button type="button" onClick={refetch} className="mt-2 font-semibold underline underline-offset-2">Try again</button>
        </div>
      ) : projectStatuses.length === 0 ? (
        <EmptyState
          icon={LuSettings}
          title="No statuses found"
          description="This project currently has no active task statuses configured."
        />
      ) : (
        <div className="divide-y divide-gray-100">
          {projectStatuses.map((status, index) => (
            <div
              key={status.id}
              className="py-3.5 flex items-center justify-between gap-4 hover:bg-gray-50/60 px-3 rounded-md transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono font-semibold text-gray-400 w-6 text-center">
                  #{status.position}
                </span>
                <div>
                  <span className="font-semibold text-gray-900 text-sm">{status.name}</span>
                  <span
                    className={`ml-3 inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                      categoryBadgeClasses[status.semanticCategory] || 'bg-gray-50 text-gray-700'
                    }`}
                  >
                    {status.semanticCategory}
                  </span>
                </div>
              </div>

              {canManage && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleReorderStatus(status.id, status.position, 'up')}
                    disabled={isReorderingStatus || index === 0}
                    aria-label={`Move status ${status.name} up`}
                    className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                  >
                    <LuArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorderStatus(status.id, status.position, 'down')}
                    disabled={isReorderingStatus || index === projectStatuses.length - 1}
                    aria-label={`Move status ${status.name} down`}
                    className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                  >
                    <LuArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameStatusError('');
                      setStatusToRename(status);
                      setRenamedStatusName(status.name);
                    }}
                    className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                    title="Rename status"
                  >
                    <LuPencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveStatusError('');
                      setStatusToArchive(status);
                    }}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Archive status"
                  >
                    <LuArchive className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Status Modal */}
      <Modal
        isOpen={isCreateStatusOpen}
        onClose={() => !isCreatingStatus && setIsCreateStatusOpen(false)}
        title="Add Task Status"
      >
        <form onSubmit={handleCreateStatusSubmit} className="space-y-4">
          {createStatusError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {createStatusError}
            </div>
          )}
          <div>
            <label htmlFor="status-name" className="block text-xs font-semibold text-gray-700 mb-1">
              Status Name <span className="text-red-500">*</span>
            </label>
            <input
              id="status-name"
              name="statusName"
              type="text"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              placeholder="e.g. In Review"
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="status-cat" className="block text-xs font-semibold text-gray-700 mb-1">
              What does this status mean? <span className="text-red-500">*</span>
            </label>
            <select
              id="status-cat"
              value={newStatusCategory}
              onChange={(e) => setNewStatusCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="REVIEW">Ready for review</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              This workflow meaning controls how TaskForge treats the status. For example, choose “Ready for review” for QA or approval stages, even if you name it “Design review”.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsCreateStatusOpen(false)}
              disabled={isCreatingStatus}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreatingStatus}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isCreatingStatus ? 'Creating...' : 'Add Status'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Rename Status Modal */}
      <Modal
        isOpen={!!statusToRename}
        onClose={() => !isRenamingStatus && setStatusToRename(null)}
        title="Rename Task Status"
      >
        <form onSubmit={handleRenameStatusSubmit} className="space-y-4">
          {renameStatusError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {renameStatusError}
            </div>
          )}
          <div>
            <label htmlFor="rename-status" className="block text-xs font-semibold text-gray-700 mb-1">
              Status Name <span className="text-red-500">*</span>
            </label>
            <input
              id="rename-status"
              type="text"
              value={renamedStatusName}
              onChange={(e) => setRenamedStatusName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setStatusToRename(null)}
              disabled={isRenamingStatus}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRenamingStatus}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isRenamingStatus ? 'Renaming...' : 'Save Name'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Archive Status Modal */}
      <Modal
        isOpen={!!statusToArchive}
        onClose={() => !isArchivingStatus && setStatusToArchive(null)}
        title="Archive Task Status"
      >
        <div className="space-y-4">
          {archiveStatusError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {archiveStatusError}
            </div>
          )}
          <p className="text-sm text-gray-600 leading-relaxed">
            Are you sure you want to archive status <strong>{statusToArchive?.name}</strong>? Backend rules require that at least one status in each required category (NOT_STARTED, IN_PROGRESS, COMPLETED) must remain active.
          </p>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setStatusToArchive(null)}
              disabled={isArchivingStatus}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchiveStatusConfirm}
              disabled={isArchivingStatus}
              className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isArchivingStatus ? 'Archiving...' : 'Confirm Archive'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectStatusesTab;
