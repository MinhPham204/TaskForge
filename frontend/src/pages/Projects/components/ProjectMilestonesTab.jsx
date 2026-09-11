import React, { useState } from 'react';
import {
  LuFlag,
  LuPlus,
  LuCalendar,
  LuLock,
  LuPencil,
  LuRotateCcw,
  LuTriangleAlert,
  LuClock,
  LuCheck,
} from 'react-icons/lu';
import Modal from '../../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import {
  useGetProjectMilestonesQuery,
  useCreateProjectMilestoneMutation,
  useUpdateProjectMilestoneMutation,
  useCloseProjectMilestoneMutation,
  useReopenProjectMilestoneMutation,
  useGetProjectModulesQuery,
} from '../../../services/projectApi';

const ProjectMilestonesTab = ({ projectId, canManage = false }) => {
  const {
    data: milestones = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectMilestonesQuery(projectId);

  const { data: modules = [] } = useGetProjectModulesQuery(projectId);
  const milestonesModuleSetting = modules.find((m) => m.moduleCode === 'MILESTONES');
  const isMilestonesModuleEnabled = Boolean(milestonesModuleSetting?.enabled);

  const [createMilestone, { isLoading: isCreating }] = useCreateProjectMilestoneMutation();
  const [updateMilestone, { isLoading: isUpdating }] = useUpdateProjectMilestoneMutation();
  const [closeMilestone, { isLoading: isClosing }] = useCloseProjectMilestoneMutation();
  const [reopenMilestone, { isLoading: isReopening }] = useReopenProjectMilestoneMutation();

  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'OPEN' | 'CLOSED'

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');
  const [createError, setCreateError] = useState('');

  // Edit modal state
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editError, setEditError] = useState('');

  const handleOpenCreate = () => {
    setCreateName('');
    setCreateDesc('');
    setCreateDueDate('');
    setCreateError('');
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createName.trim() || !createDueDate) {
      setCreateError('Milestone name and due date are required.');
      return;
    }
    setCreateError('');
    try {
      await createMilestone({
        projectId,
        name: createName.trim(),
        description: createDesc.trim() || undefined,
        dueDate: createDueDate,
      }).unwrap();
      setIsCreateOpen(false);
    } catch (err) {
      setCreateError(err?.data?.message || err?.message || 'Failed to create milestone');
    }
  };

  const handleOpenEdit = (milestone) => {
    setEditingMilestone(milestone);
    setEditName(milestone.name || '');
    setEditDesc(milestone.description || '');
    setEditDueDate(milestone.dueDate ? milestone.dueDate.substring(0, 10) : '');
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !editDueDate) {
      setEditError('Milestone name and due date are required.');
      return;
    }
    setEditError('');
    try {
      await updateMilestone({
        projectId,
        milestoneId: editingMilestone.id,
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        dueDate: editDueDate,
      }).unwrap();
      setEditingMilestone(null);
    } catch (err) {
      setEditError(err?.data?.message || err?.message || 'Failed to update milestone');
    }
  };

  const handleCloseMilestone = async (milestoneId) => {
    try {
      await closeMilestone({ projectId, milestoneId }).unwrap();
    } catch (err) {
      alert(err?.data?.message || err?.message || 'Failed to close milestone');
    }
  };

  const handleReopenMilestone = async (milestoneId) => {
    try {
      await reopenMilestone({ projectId, milestoneId }).unwrap();
    } catch (err) {
      alert(err?.data?.message || err?.message || 'Failed to reopen milestone');
    }
  };

  const filteredMilestones = milestones.filter((m) => {
    if (filter === 'OPEN') return m.statusCode === 'OPEN';
    if (filter === 'CLOSED') return m.statusCode === 'CLOSED';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Module Disabled Banner */}
      {!isMilestonesModuleEnabled && (
        <div
          role="status"
          className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3"
        >
          <LuTriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Milestones Module is Disabled</p>
            <p>
              The Milestones module is currently disabled in project settings. Existing milestone
              records and linked tasks are preserved, but creating or modifying milestones is
              temporarily restricted.
            </p>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <LuFlag className="w-5 h-5 text-primary" />
            Milestones & Checkpoints
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Track key project phases, deadlines, and delivery milestones with aggregated task completion.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Filter Tabs */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
            {['ALL', 'OPEN', 'CLOSED'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  filter === tab
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab === 'OPEN' ? 'Open' : 'Closed'}
              </button>
            ))}
          </div>

          {canManage && isMilestonesModuleEnabled && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              <LuPlus className="w-4 h-4" />
              New Milestone
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState message="Loading project milestones..." />
      ) : isError ? (
        <ErrorState
          title="Failed to load milestones"
          message={error?.data?.message || 'Could not fetch milestones at this time.'}
          onRetry={refetch}
        />
      ) : filteredMilestones.length === 0 ? (
        <EmptyState
          icon={LuFlag}
          title={
            filter === 'ALL'
              ? 'No milestones created yet'
              : `No ${filter.toLowerCase()} milestones found`
          }
          description={
            canManage && isMilestonesModuleEnabled
              ? 'Define target dates and delivery gates to track aggregated task progress.'
              : 'No milestone records match this filter.'
          }
          actionLabel={
            canManage && isMilestonesModuleEnabled && filter === 'ALL' ? 'Create Milestone' : null
          }
          onAction={
            canManage && isMilestonesModuleEnabled && filter === 'ALL' ? handleOpenCreate : null
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMilestones.map((m) => {
            const isOpen = m.statusCode === 'OPEN';
            const progress = Number(m.progressPercent || 0);
            const activeCount = Number(m.activeTaskCount || 0);
            const completedCount = Number(m.completedTaskCount || 0);

            return (
              <div
                key={m.id}
                className="bg-white border border-gray-100 rounded-xl p-5 shadow-xs hover:border-gray-200 transition-all space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full border ${
                          isOpen
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {isOpen ? (
                          <>
                            <LuClock className="w-3 h-3" />
                            OPEN
                          </>
                        ) : (
                          <>
                            <LuCheck className="w-3 h-3" />
                            CLOSED
                          </>
                        )}
                      </span>
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{m.name}</h3>
                    </div>
                    {m.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{m.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  {canManage && isMilestonesModuleEnabled && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(m)}
                        title="Edit Milestone"
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
                      >
                        <LuPencil className="w-3.5 h-3.5" />
                      </button>
                      {isOpen ? (
                        <button
                          type="button"
                          onClick={() => handleCloseMilestone(m.id)}
                          disabled={isClosing}
                          title="Close Milestone"
                          className="px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          Close
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReopenMilestone(m.id)}
                          disabled={isReopening}
                          title="Reopen Milestone"
                          className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <LuRotateCcw className="w-3 h-3" />
                          Reopen
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress Bar & Details */}
                <div className="space-y-2 pt-2 border-t border-gray-50">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <LuCalendar className="w-3.5 h-3.5 text-gray-400" />
                      Due {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'N/A'}
                    </span>
                    <span className="font-medium text-gray-700">
                      {completedCount} / {activeCount} tasks ({progress}%)
                    </span>
                  </div>

                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        progress === 100
                          ? 'bg-emerald-500'
                          : isOpen
                          ? 'bg-primary'
                          : 'bg-gray-400'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Milestone Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Milestone"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
            >
              <LuTriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Milestone Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={500}
              placeholder="e.g. Beta Release v1.0, Architecture Review"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Due Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              required
              value={createDueDate}
              onChange={(e) => setCreateDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description (Optional)</label>
            <textarea
              rows={3}
              maxLength={10000}
              placeholder="Objectives and deliverables required for this milestone..."
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Milestone'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Milestone Modal */}
      <Modal
        isOpen={Boolean(editingMilestone)}
        onClose={() => setEditingMilestone(null)}
        title="Edit Milestone"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
            >
              <LuTriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Milestone Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={500}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Due Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              required
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              maxLength={10000}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setEditingMilestone(null)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer disabled:opacity-50"
            >
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ProjectMilestonesTab;
