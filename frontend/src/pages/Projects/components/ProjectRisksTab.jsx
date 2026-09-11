import React, { useState } from 'react';
import {
  LuOctagonAlert,
  LuPlus,
  LuPencil,
  LuTrash2,
  LuLink,
  LuShieldAlert,
  LuTriangleAlert,
  LuCheck,
  LuUser,
  LuFileText,
  LuShieldCheck,
  LuArrowRight,
} from 'react-icons/lu';
import Modal from '../../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../../components/common/PageState';
import {
  useGetProjectRisksQuery,
  useCreateProjectRiskMutation,
  useUpdateProjectRiskMutation,
  useArchiveProjectRiskMutation,
  useLinkRiskTaskMutation,
  useGetProjectMembersQuery,
  useGetProjectModulesQuery,
} from '../../../services/projectApi';
import { useGetProjectTasksQuery } from '../../../services/taskApi';

const scaleBadges = {
  LOW: 'bg-blue-50 text-blue-700 border-blue-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HIGH: 'bg-red-50 text-red-700 border-red-200',
};

const stateBadges = {
  OPEN: 'bg-amber-50 text-amber-700 border-amber-200',
  MITIGATING: 'bg-blue-50 text-blue-700 border-blue-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const ProjectRisksTab = ({ projectId, canManage = false }) => {
  const {
    data: risks = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectRisksQuery(projectId);

  const { data: members = [] } = useGetProjectMembersQuery(projectId);
  const { data: modules = [] } = useGetProjectModulesQuery(projectId);
  const { data: tasksData } = useGetProjectTasksQuery({ projectId });
  const tasks = tasksData?.tasks || [];

  const risksModuleSetting = modules.find((m) => m.moduleCode === 'RISKS');
  const isRisksModuleEnabled = Boolean(risksModuleSetting?.enabled);

  const [createRisk, { isLoading: isCreating }] = useCreateProjectRiskMutation();
  const [updateRisk, { isLoading: isUpdating }] = useUpdateProjectRiskMutation();
  const [archiveRisk, { isLoading: isArchiving }] = useArchiveProjectRiskMutation();
  const [linkTask, { isLoading: isLinking }] = useLinkRiskTaskMutation();

  const [stateFilter, setStateFilter] = useState('ALL'); // 'ALL' | 'OPEN' | 'MITIGATING' | 'RESOLVED'

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createLikelihood, setCreateLikelihood] = useState('MEDIUM');
  const [createImpact, setCreateImpact] = useState('MEDIUM');
  const [createOwnerId, setCreateOwnerId] = useState('');
  const [createMitigation, setCreateMitigation] = useState('');
  const [createError, setCreateError] = useState('');

  // Edit Modal State
  const [editingRisk, setEditingRisk] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLikelihood, setEditLikelihood] = useState('MEDIUM');
  const [editImpact, setEditImpact] = useState('MEDIUM');
  const [editOwnerId, setEditOwnerId] = useState('');
  const [editMitigation, setEditMitigation] = useState('');
  const [editState, setEditState] = useState('OPEN');
  const [editError, setEditError] = useState('');

  // Archive Modal State
  const [riskToArchive, setRiskToArchive] = useState(null);
  const [archiveError, setArchiveError] = useState('');

  // Link Task Modal State
  const [linkingRisk, setLinkingRisk] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [linkError, setLinkError] = useState('');

  const handleOpenCreate = () => {
    setCreateTitle('');
    setCreateDesc('');
    setCreateLikelihood('MEDIUM');
    setCreateImpact('MEDIUM');
    setCreateOwnerId(members[0]?.id || members[0]?.organizationMembershipId || '');
    setCreateMitigation('');
    setCreateError('');
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createTitle.trim() || !createOwnerId) {
      setCreateError('Title and Risk Owner are required.');
      return;
    }
    setCreateError('');
    try {
      await createRisk({
        projectId,
        title: createTitle.trim(),
        description: createDesc.trim() || undefined,
        likelihoodCode: createLikelihood,
        impactCode: createImpact,
        ownerProjectMembershipId: createOwnerId,
        mitigation: createMitigation.trim() || undefined,
      }).unwrap();
      setIsCreateOpen(false);
    } catch (err) {
      setCreateError(err?.data?.message || err?.message || 'Failed to create risk');
    }
  };

  const handleOpenEdit = (risk) => {
    setEditingRisk(risk);
    setEditTitle(risk.title || '');
    setEditDesc(risk.description || '');
    setEditLikelihood(risk.likelihoodCode || 'MEDIUM');
    setEditImpact(risk.impactCode || 'MEDIUM');
    setEditOwnerId(risk.ownerProjectMembershipId || '');
    setEditMitigation(risk.mitigation || '');
    setEditState(risk.state || 'OPEN');
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editTitle.trim() || !editOwnerId) {
      setEditError('Title and Risk Owner are required.');
      return;
    }
    setEditError('');
    try {
      await updateRisk({
        projectId,
        riskId: editingRisk.id,
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        likelihoodCode: editLikelihood,
        impactCode: editImpact,
        ownerProjectMembershipId: editOwnerId,
        mitigation: editMitigation.trim() || undefined,
        state: editState,
      }).unwrap();
      setEditingRisk(null);
    } catch (err) {
      setEditError(err?.data?.message || err?.message || 'Failed to update risk');
    }
  };

  const handleConfirmArchive = async () => {
    if (!riskToArchive) return;
    setArchiveError('');
    try {
      await archiveRisk({ projectId, riskId: riskToArchive.id }).unwrap();
      setRiskToArchive(null);
    } catch (err) {
      setArchiveError(err?.data?.message || err?.message || 'Failed to archive risk');
    }
  };

  const handleOpenLinkTask = (risk) => {
    setLinkingRisk(risk);
    setSelectedTaskId(tasks[0]?.id || '');
    setLinkError('');
  };

  const handleLinkTaskSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTaskId) {
      setLinkError('Please select a task to link.');
      return;
    }
    setLinkError('');
    try {
      await linkTask({
        projectId,
        riskId: linkingRisk.id,
        taskId: selectedTaskId,
      }).unwrap();
      setLinkingRisk(null);
    } catch (err) {
      setLinkError(err?.data?.message || err?.message || 'Failed to link task');
    }
  };

  const filteredRisks = risks.filter((r) => {
    if (stateFilter === 'ALL') return true;
    return r.state === stateFilter;
  });

  return (
    <div className="space-y-6">
      {/* Module Disabled Banner */}
      {!isRisksModuleEnabled && (
        <div
          role="status"
          className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3"
        >
          <LuTriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Risk Management Module is Disabled</p>
            <p>
              The Risk module is currently disabled in project settings. Existing risk records and
              mitigation links are preserved, but adding or updating risks is temporarily restricted.
            </p>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <LuOctagonAlert className="w-5 h-5 text-primary" />
            Risk Register & Mitigation
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Identify delivery impediments, assess likelihood and impact, and assign mitigation plans.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* State Filter Tabs */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs">
            {['ALL', 'OPEN', 'MITIGATING', 'RESOLVED'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStateFilter(tab)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer capitalize ${
                  stateFilter === tab
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.toLowerCase()}
              </button>
            ))}
          </div>

          {canManage && isRisksModuleEnabled && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
            >
              <LuPlus className="w-4 h-4" />
              New Risk
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState message="Loading risk register..." />
      ) : isError ? (
        <ErrorState
          title="Failed to load risks"
          message={error?.data?.message || 'Could not fetch risks at this time.'}
          onRetry={refetch}
        />
      ) : filteredRisks.length === 0 ? (
        <EmptyState
          icon={LuOctagonAlert}
          title={
            stateFilter === 'ALL'
              ? 'No risks recorded'
              : `No ${stateFilter.toLowerCase()} risks found`
          }
          description={
            canManage && isRisksModuleEnabled
              ? 'Log potential project delivery blockers, evaluate severity, and assign owners.'
              : 'No risk items match this filter criteria.'
          }
          actionLabel={canManage && isRisksModuleEnabled && stateFilter === 'ALL' ? 'Record Risk' : null}
          onAction={canManage && isRisksModuleEnabled && stateFilter === 'ALL' ? handleOpenCreate : null}
        />
      ) : (
        <div className="space-y-3">
          {filteredRisks.map((risk) => {
            const owner = members.find(
              (m) => m.id === risk.ownerProjectMembershipId || m.organizationMembershipId === risk.ownerProjectMembershipId
            );

            return (
              <div
                key={risk.id}
                className="bg-white border border-gray-100 rounded-xl p-5 shadow-xs hover:border-gray-200 transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${
                          stateBadges[risk.state] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {risk.state}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border ${
                          scaleBadges[risk.likelihoodCode] || ''
                        }`}
                      >
                        Likelihood: {risk.likelihoodCode}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border ${
                          scaleBadges[risk.impactCode] || ''
                        }`}
                      >
                        Impact: {risk.impactCode}
                      </span>

                      <h3 className="text-sm font-semibold text-gray-900">{risk.title}</h3>
                    </div>

                    {risk.description && (
                      <p className="text-xs text-gray-600 leading-relaxed">{risk.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  {canManage && isRisksModuleEnabled && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenLinkTask(risk)}
                        title="Link Task to Risk"
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-blue-50 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 text-xs"
                      >
                        <LuLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Link Task</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(risk)}
                        title="Edit Risk"
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors cursor-pointer"
                      >
                        <LuPencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRiskToArchive(risk)}
                        title="Archive Risk"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                      >
                        <LuTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Mitigation & Owner details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-50 text-xs text-gray-600">
                  <div className="flex items-start gap-2">
                    <LuShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-gray-700">Mitigation Plan: </span>
                      <span>{risk.mitigation || 'No specific mitigation plan recorded.'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <LuUser className="w-3.5 h-3.5 text-gray-400" />
                      Owner: <strong className="text-gray-700">{owner?.user?.fullName || owner?.user?.email || 'Assigned Member'}</strong>
                    </span>
                  </div>
                </div>

                {/* Linked Tasks */}
                {risk.linkedTasks && risk.linkedTasks.length > 0 && (
                  <div className="pt-2 border-t border-gray-50 flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-gray-400 flex items-center gap-1 text-[11px]">
                      <LuLink className="w-3 h-3" /> Linked Tasks:
                    </span>
                    {risk.linkedTasks.map((t) => (
                      <span
                        key={t.taskId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-md text-[11px] text-gray-700 font-medium"
                      >
                        {t.taskTitle || t.taskId}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Risk Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Record New Project Risk"
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
              Risk Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={500}
              placeholder="e.g. Third-party payment gateway rate limiting"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Likelihood</label>
              <select
                value={createLikelihood}
                onChange={(e) => setCreateLikelihood(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Impact</label>
              <select
                value={createImpact}
                onChange={(e) => setCreateImpact(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Risk Owner <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={createOwnerId}
              onChange={(e) => setCreateOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select project member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user?.fullName || m.user?.email || m.id} ({m.projectRole})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Mitigation Plan</label>
            <textarea
              rows={3}
              placeholder="Action plan to prevent or address this risk..."
              value={createMitigation}
              onChange={(e) => setCreateMitigation(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Additional background and context..."
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
              {isCreating ? 'Recording...' : 'Record Risk'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Risk Modal */}
      <Modal
        isOpen={Boolean(editingRisk)}
        onClose={() => setEditingRisk(null)}
        title="Edit Risk"
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
              Risk Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={500}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
              <select
                value={editState}
                onChange={(e) => setEditState(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="OPEN">Open</option>
                <option value="MITIGATING">Mitigating</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Likelihood</label>
              <select
                value={editLikelihood}
                onChange={(e) => setEditLikelihood(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Impact</label>
              <select
                value={editImpact}
                onChange={(e) => setEditImpact(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Risk Owner <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={editOwnerId}
              onChange={(e) => setEditOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select project member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user?.fullName || m.user?.email || m.id} ({m.projectRole})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Mitigation Plan</label>
            <textarea
              rows={3}
              value={editMitigation}
              onChange={(e) => setEditMitigation(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setEditingRisk(null)}
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

      {/* Link Task Modal */}
      <Modal
        isOpen={Boolean(linkingRisk)}
        onClose={() => setLinkingRisk(null)}
        title={`Link Task to Risk: ${linkingRisk?.title}`}
      >
        <form onSubmit={handleLinkTaskSubmit} className="space-y-4">
          {linkError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
            >
              <LuTriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{linkError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Select Task to Link <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select project task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status?.name || t.priorityCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLinkingRisk(null)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLinking}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer disabled:opacity-50"
            >
              {isLinking ? 'Linking...' : 'Link Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Archive Risk Modal */}
      <Modal
        isOpen={Boolean(riskToArchive)}
        onClose={() => setRiskToArchive(null)}
        title="Archive Risk"
      >
        <div className="space-y-4">
          {archiveError && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
            >
              <LuTriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{archiveError}</span>
            </div>
          )}

          <p className="text-xs text-gray-600 leading-relaxed">
            Are you sure you want to archive{' '}
            <strong className="text-gray-900">{riskToArchive?.title}</strong>? This item will be
            removed from the active risk register.
          </p>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setRiskToArchive(null)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmArchive}
              disabled={isArchiving}
              className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50"
            >
              {isArchiving ? 'Archiving...' : 'Archive Risk'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectRisksTab;
