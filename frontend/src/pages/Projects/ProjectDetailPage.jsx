import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LuFolderKanban,
  LuCalendar,
  LuShield,
  LuUserCheck,
  LuPencil,
  LuPlay,
  LuCircleCheck,
  LuRotateCcw,
  LuArchive,
  LuArchiveRestore,
  LuChevronRight,
  LuUsers,
  LuColumns3,
  LuBoxes,
  LuInfo,
  LuListTodo,
  LuTrendingUp,
  LuSettings,
  LuFileText,
  LuActivity,
  LuFlag,
  LuFolder,
  LuOctagonAlert,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState } from '../../components/common/PageState';
import {
  useGetProjectByIdQuery,
  useUpdateProjectMutation,
  useTransitionProjectLifecycleMutation,
} from '../../services/projectApi';

import ProjectOverviewTab from './components/ProjectOverviewTab';
import ProjectParticipantsTab from './components/ProjectParticipantsTab';
import ProjectStatusesTab from './components/ProjectStatusesTab';
import ProjectModulesTab from './components/ProjectModulesTab';
import ProjectTaskBoardTab from './components/ProjectTaskBoardTab';
import ProjectTaskListTab from './components/ProjectTaskListTab';
import ProjectTaskReportTab from './components/ProjectTaskReportTab';
import ProjectFilesTab from './components/ProjectFilesTab';
import ProjectActivityTab from './components/ProjectActivityTab';
import ProjectMilestonesTab from './components/ProjectMilestonesTab';
import ProjectDocumentsTab from './components/ProjectDocumentsTab';
import ProjectRisksTab from './components/ProjectRisksTab';
import TaskDetailModal from './components/TaskDetailModal';
import TaskFormModal from './components/TaskFormModal';

const stateBadgeClasses = {
  DRAFT: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ARCHIVED: 'bg-gray-100 text-gray-600 border-gray-200',
};

const TABS = [
  { key: 'board', label: 'Board', icon: LuColumns3 },
  { key: 'tasks', label: 'Tasks', icon: LuListTodo },
  { key: 'overview', label: 'Overview', icon: LuInfo },
  { key: 'milestones', label: 'Milestones', icon: LuFlag },
  { key: 'documents', label: 'Documents', icon: LuFileText },
  { key: 'files', label: 'Files', icon: LuFolder },
  { key: 'risks', label: 'Risks', icon: LuOctagonAlert },
  { key: 'report', label: 'Report & Workload', icon: LuTrendingUp },
  { key: 'participants', label: 'Participants', icon: LuUsers },
  { key: 'statuses', label: 'Statuses', icon: LuSettings },
  { key: 'modules', label: 'Modules', icon: LuBoxes },
  { key: 'activity', label: 'Activity', icon: LuActivity },
];

const SETUP_TABS = new Set(['participants', 'statuses', 'modules']);
const PROJECT_TAB_KEYS = new Set(TABS.map((tab) => tab.key));

const ProjectDetailPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setupTab = searchParams.get('setup');
  const requestedTab = setupTab || searchParams.get('tab');

  const [activeTab, setActiveTab] = useState(
    () => (PROJECT_TAB_KEYS.has(requestedTab) ? requestedTab : 'board')
  );
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);

  // Queries & Mutations
  const { data: project, isLoading, isError, error, refetch } = useGetProjectByIdQuery(projectId);

  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();
  const [transitionLifecycle, { isLoading: isTransitioning }] =
    useTransitionProjectLifecycleMutation();

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editError, setEditError] = useState('');

  // Lifecycle Confirmation Modal State
  const [lifecycleAction, setLifecycleAction] = useState(null); // { type, title, message }
  const [lifecycleError, setLifecycleError] = useState('');

  const canManage = Boolean(project?.viewer?.canManage);

  const handleOpenEdit = () => {
    if (!project) return;
    setEditName(project.name || '');
    setEditDescription(project.description || '');
    setEditStartDate(project.startDate ? project.startDate.substring(0, 10) : '');
    setEditEndDate(project.endDate ? project.endDate.substring(0, 10) : '');
    setEditError('');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    try {
      await updateProject({
        projectId,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        startDate: editStartDate ? new Date(editStartDate).toISOString() : null,
        endDate: editEndDate ? new Date(editEndDate).toISOString() : null,
      }).unwrap();
      setIsEditOpen(false);
    } catch (err) {
      setEditError(err.response?.data?.message || err.data?.message || 'Failed to update project');
    }
  };

  const promptLifecycleAction = (type, title, message) => {
    setLifecycleError('');
    setLifecycleAction({ type, title, message });
  };

  const handleConfirmLifecycle = async () => {
    if (!lifecycleAction) return;
    setLifecycleError('');
    try {
      await transitionLifecycle({
        projectId,
        command: lifecycleAction.type,
      }).unwrap();
      setLifecycleAction(null);
    } catch (err) {
      setLifecycleError(
        err.response?.data?.message || err.data?.message || 'Failed to execute lifecycle action'
      );
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout activeMenu="/projects">
        <LoadingState message="Loading project details..." />
      </DashboardLayout>
    );
  }

  if (isError || !project) {
    return (
      <DashboardLayout activeMenu="/projects">
        <ErrorState
          title="Project Not Found"
          message={error?.data?.message || 'Unable to load project information or access is denied.'}
          onRetry={refetch}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="/projects">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
          >
            <LuFolderKanban className="w-4 h-4" />
            Projects
          </button>
          <LuChevronRight className="w-4 h-4 text-gray-400" />
          <span className="text-gray-900 font-medium truncate max-w-xs">{project.name}</span>
        </div>

        {/* Header card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-3 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{project.name}</h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    stateBadgeClasses[project.state] || 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  {project.state}
                </span>

                {project.viewer?.role && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    <LuShield className="w-3 h-3" />
                    {project.viewer.role}
                  </span>
                )}
                {canManage && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                    <LuUserCheck className="w-3 h-3" />
                    Manager
                  </span>
                )}
              </div>

              {project.description ? (
                <p className="text-sm text-gray-600 leading-relaxed">{project.description}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">No description provided.</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-1">
                {(project.startDate || project.endDate) && (
                  <span className="flex items-center gap-1.5">
                    <LuCalendar className="w-3.5 h-3.5 text-gray-400" />
                    {project.startDate
                      ? new Date(project.startDate).toLocaleDateString()
                      : 'No start date'}{' '}
                    &rarr;{' '}
                    {project.endDate
                      ? new Date(project.endDate).toLocaleDateString()
                      : 'No end date'}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 self-start">
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors cursor-pointer"
                  >
                    <LuPencil className="w-3.5 h-3.5" />
                    Edit Details
                  </button>

                  {/* State transition buttons */}
                  {project.state === 'DRAFT' && (
                    <button
                      type="button"
                      onClick={() =>
                        promptLifecycleAction(
                          'activate',
                          'Activate Project',
                          'Activating this project will make it available for task execution and collaboration. Proceed?'
                        )
                      }
                      disabled={isTransitioning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <LuPlay className="w-3.5 h-3.5" />
                      Activate
                    </button>
                  )}

                  {project.state === 'ACTIVE' && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          promptLifecycleAction(
                            'complete',
                            'Complete Project',
                            'Marking this project as completed indicates all milestones are met. You can reopen it if needed. Proceed?'
                          )
                        }
                        disabled={isTransitioning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <LuCircleCheck className="w-3.5 h-3.5" />
                        Complete
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          promptLifecycleAction(
                            'archive',
                            'Archive Project',
                            'Archiving this project will make it read-only for participants. You can restore it later. Proceed?'
                          )
                        }
                        disabled={isTransitioning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <LuArchive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    </>
                  )}

                  {project.state === 'COMPLETED' && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          promptLifecycleAction(
                            'reopen',
                            'Reopen Project',
                            'Reopening will change the state back to ACTIVE. Proceed?'
                          )
                        }
                        disabled={isTransitioning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <LuRotateCcw className="w-3.5 h-3.5" />
                        Reopen
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          promptLifecycleAction(
                            'archive',
                            'Archive Project',
                            'Archiving this project will move it to ARCHIVED state. Proceed?'
                          )
                        }
                        disabled={isTransitioning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <LuArchive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    </>
                  )}

                  {project.state === 'ARCHIVED' && (
                    <button
                      type="button"
                      onClick={() =>
                        promptLifecycleAction(
                          'restore',
                          'Restore Project',
                          'Restoring this project will return it to active state. Proceed?'
                        )
                      }
                      disabled={isTransitioning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <LuArchiveRestore className="w-3.5 h-3.5" />
                      Restore
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {SETUP_TABS.has(setupTab) && canManage && (
          <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm" aria-label="Project setup guidance">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-950">Complete your project setup</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-900">
                  Your starter project is ready. Add collaborators, tailor the workflow, and review enabled tools before you activate it.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ['participants', '1. Participants'],
                  ['statuses', '2. Workflow'],
                  ['modules', '3. Modules'],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                      activeTab === tab
                        ? 'border-primary bg-primary text-white'
                        : 'border-blue-200 bg-white text-blue-800 hover:border-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSearchParams({})}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Tab navigation bar */}
        <div className="border-b border-gray-200 bg-white rounded-t-xl px-4 pt-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'board' && (
            <ProjectTaskBoardTab
              projectId={projectId}
              canManage={canManage}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onCreateTask={() => {
                setTaskToEdit(null);
                setIsTaskFormOpen(true);
              }}
            />
          )}

          {activeTab === 'tasks' && (
            <ProjectTaskListTab
              projectId={projectId}
              canManage={canManage}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onCreateTask={() => {
                setTaskToEdit(null);
                setIsTaskFormOpen(true);
              }}
            />
          )}

          {activeTab === 'overview' && (
            <ProjectOverviewTab
              project={project}
              canManage={canManage}
              onSwitchTab={setActiveTab}
            />
          )}

          {activeTab === 'report' && (
            <ProjectTaskReportTab
              projectId={projectId}
              onSelectTask={(id) => setSelectedTaskId(id)}
            />
          )}

          {activeTab === 'participants' && (
            <ProjectParticipantsTab projectId={projectId} canManage={canManage} />
          )}

          {activeTab === 'statuses' && (
            <ProjectStatusesTab projectId={projectId} canManage={canManage} />
          )}

          {activeTab === 'modules' && (
            <ProjectModulesTab projectId={projectId} canManage={canManage} />
          )}

          {activeTab === 'milestones' && (
            <ProjectMilestonesTab projectId={projectId} canManage={canManage} />
          )}

          {activeTab === 'documents' && (
            <ProjectDocumentsTab projectId={projectId} canManage={canManage} />
          )}

          {activeTab === 'files' && (
            <ProjectFilesTab projectId={projectId} canManage={canManage} />
          )}

          {activeTab === 'risks' && (
            <ProjectRisksTab projectId={projectId} canManage={canManage} />
          )}

          {activeTab === 'activity' && (
            <ProjectActivityTab projectId={projectId} />
          )}
        </div>
      </div>

      {/* Edit Details Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Project Details"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {editError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. Core Infrastructure"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Project goals, scope and objectives..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating || !editName.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer disabled:opacity-50"
            >
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Lifecycle Confirmation Modal */}
      <Modal
        isOpen={Boolean(lifecycleAction)}
        onClose={() => setLifecycleAction(null)}
        title={lifecycleAction?.title || 'Confirm Action'}
      >
        <div className="space-y-4">
          {lifecycleError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {lifecycleError}
            </div>
          )}

          <p className="text-sm text-gray-600">{lifecycleAction?.message}</p>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLifecycleAction(null)}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmLifecycle}
              disabled={isTransitioning}
              className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 cursor-pointer disabled:opacity-50"
            >
              {isTransitioning ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={Boolean(selectedTaskId)}
        onClose={() => setSelectedTaskId(null)}
        projectId={projectId}
        taskId={selectedTaskId}
        canManage={canManage}
        onEditTask={(task) => {
          setSelectedTaskId(null);
          setTaskToEdit(task);
          setIsTaskFormOpen(true);
        }}
      />

      {/* Task Create / Edit Modal */}
      <TaskFormModal
        isOpen={isTaskFormOpen}
        onClose={() => {
          setIsTaskFormOpen(false);
          setTaskToEdit(null);
        }}
        projectId={projectId}
        task={taskToEdit}
        canManage={canManage}
      />
    </DashboardLayout>
  );
};

export default ProjectDetailPage;
