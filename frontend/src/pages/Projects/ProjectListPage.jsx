import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuPlus,
  LuFolderKanban,
  LuCalendar,
  LuArrowRight,
  LuShield,
  LuUserCheck,
  LuCircleCheck,
  LuSettings,
  LuUsers,
  LuBoxes,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetProjectsQuery, useCreateProjectMutation } from '../../services/projectApi';

const STATE_TABS = ['ALL', 'ACTIVE', 'DRAFT', 'COMPLETED', 'ARCHIVED'];

const stateBadgeClasses = {
  DRAFT: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ARCHIVED: 'bg-gray-100 text-gray-600 border-gray-200',
};

const ProjectListPage = () => {
  const navigate = useNavigate();
  const { role } = useUserAuth();
  const isOrgAdmin = role === 'owner' || role === 'admin';

  const { data: projects = [], isLoading, isError, error, refetch } = useGetProjectsQuery();
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();

  const [activeTab, setActiveTab] = useState('ALL');

  // Create Project Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [createError, setCreateError] = useState('');
  const [createdProject, setCreatedProject] = useState(null);

  const filteredProjects = useMemo(() => {
    if (activeTab === 'ALL') return projects;
    return projects.filter((p) => p.state === activeTab);
  }, [projects, activeTab]);

  const handleOpenCreate = () => {
    setName('');
    setDescription('');
    setStartDate('');
    setDueDate('');
    setCreateError('');
    setCreatedProject(null);
    setIsCreateOpen(true);
  };

  const handleCloseCreate = () => {
    if (isCreating) return;
    setIsCreateOpen(false);
    setCreatedProject(null);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setCreateError('Project name is required');
      return;
    }

    if (startDate && dueDate && startDate > dueDate) {
      setCreateError('Due date cannot be before start date');
      return;
    }

    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
      };
      const created = await createProject(payload).unwrap();
      if (created?.id) {
        setCreatedProject(created);
      } else {
        setCreateError('Project was created, but its setup link could not be loaded. Refresh the project list and try again.');
      }
    } catch (err) {
      setCreateError(err?.data?.message || err?.message || 'Failed to create project');
    }
  };

  return (
    <DashboardLayout activeMenu="/projects">
      <div className="my-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse, monitor and manage scoped projects across your organization workspace.
            </p>
          </div>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <LuPlus className="w-4 h-4" />
              Create Project
            </button>
          )}
        </div>

        {/* State Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-3 mb-6 overflow-x-auto">
          {STATE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Query State Handling */}
        {isLoading && <LoadingState message="Loading projects..." />}

        {isError && (
          <ErrorState
            title="Unable to load projects"
            message={error?.data?.message || 'Failed to fetch projects in this workspace.'}
            onRetry={refetch}
          />
        )}

        {!isLoading && !isError && filteredProjects.length === 0 && (
          <EmptyState
            icon={LuFolderKanban}
            title={activeTab === 'ALL' ? 'No projects yet' : `No ${activeTab.toLowerCase()} projects`}
            description={
              isOrgAdmin && activeTab === 'ALL'
                ? 'Create a project to assemble participating teams, statuses, and manage workflows.'
                : 'No projects match the selected status filter.'
            }
            action={
              isOrgAdmin && activeTab === 'ALL' ? (
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <LuPlus className="w-4 h-4" />
                  Create Project
                </button>
              ) : null
            }
          />
        )}

        {!isLoading && !isError && filteredProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="bg-white border border-gray-100 rounded-lg p-5 shadow-xs hover:shadow-md hover:border-blue-200 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <span
                      className={`inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${
                        stateBadgeClasses[project.state] || 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {project.state}
                    </span>
                    <span className="p-1 text-gray-400 hover:text-primary transition-colors">
                      <LuArrowRight className="w-4 h-4" />
                    </span>
                  </div>

                  <h2 className="text-base font-semibold text-gray-900 mb-1.5 hover:text-primary transition-colors">
                    {project.name}
                  </h2>
                  <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-4">
                    {project.description || 'No description provided.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-50 flex flex-col gap-2 text-xs">
                  {(project.startDate || project.dueDate) && (
                    <div className="flex items-center gap-1.5 text-gray-500 text-[11px]">
                      <LuCalendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>
                        {project.startDate ? new Date(project.startDate).toLocaleDateString() : 'Start TBD'}
                        {' — '}
                        {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'Due TBD'}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <div className="flex items-center gap-1">
                      {project.viewer?.projectRole === 'PROJECT_MANAGER' ? (
                        <span className="inline-flex items-center gap-1 text-primary font-medium">
                          <LuShield className="w-3 h-3" />
                          Project Manager
                        </span>
                      ) : project.viewer?.projectRole === 'CONTRIBUTOR' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <LuUserCheck className="w-3 h-3" />
                          Contributor
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-500 font-medium">
                          Org Visibility
                        </span>
                      )}
                    </div>
                    <span className="text-primary font-medium">View overview</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Project Modal */}
        <Modal
          isOpen={isCreateOpen}
          onClose={handleCloseCreate}
          title={createdProject ? 'Project ready' : 'Create Project'}
          maxWidth="max-w-2xl"
        >
          {createdProject ? (
            <div className="space-y-5">
              <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <LuCircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{createdProject.name} is ready to set up</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                    A draft project was created with your General team, you as Project Manager, four starter statuses, and the default collaboration modules.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900">Finish the setup when you are ready</h3>
                <p className="mt-1 text-xs text-gray-500">These are optional next steps. You can start planning tasks immediately or refine the workspace first.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: LuUsers, title: 'Participants', description: 'Add teams and project members.' },
                  { icon: LuSettings, title: 'Workflow', description: 'Rename or reorder task statuses.' },
                  { icon: LuBoxes, title: 'Modules', description: 'Review enabled project tools.' },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    <p className="mt-2 text-xs font-semibold text-gray-900">{title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{description}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    handleCloseCreate();
                    navigate(`/projects/${createdProject.id}`);
                  }}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  Go to project board
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseCreate();
                    navigate(`/projects/${createdProject.id}?setup=participants`);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Continue to advanced setup
                  <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-sm font-semibold text-gray-900">Start with the essentials</p>
              <p className="mt-1 text-xs leading-relaxed text-blue-900">
                Create the project now, then continue to its setup workspace to add participants, tailor statuses, and enable the modules your team needs.
              </p>
            </div>
            {createError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {createError}
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="proj-name" className="block text-xs font-semibold text-gray-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                id="proj-name"
                name="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mobile Application Launch"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="proj-desc" className="block text-xs font-semibold text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                id="proj-desc"
                name="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Scope, objectives, and deliverables..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg bg-gray-50/70 p-4 border border-gray-100">
              <div>
                <label htmlFor="proj-start" className="block text-xs font-semibold text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  id="proj-start"
                  name="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="proj-due" className="block text-xs font-semibold text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  id="proj-due"
                  name="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-[11px] text-gray-700 leading-relaxed">
              <strong>Included setup:</strong> The General team is added as a participating team, you become the <strong>Project Manager</strong>, and TaskForge initializes configurable task statuses plus Milestones, Documents, Files, and Risks.
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCloseCreate}
                disabled={isCreating}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCreating ? 'Creating Project...' : 'Create Project'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default ProjectListPage;
