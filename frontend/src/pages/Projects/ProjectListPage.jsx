import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  LuChevronDown,
  LuChevronUp,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetProjectsQuery, useCreateProjectMutation } from '../../services/projectApi';

const STATE_TABS = ['ALL', 'ACTIVE', 'DRAFT', 'COMPLETED', 'ARCHIVED'];

const PROJECT_THEMES = [
  { accent: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200/60 dark:border-blue-900/60' },
  { accent: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-900/60' },
  { accent: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/60' },
  { accent: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200/60 dark:border-violet-900/60' },
  { accent: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/60 dark:border-amber-900/60' },
  { accent: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200/60 dark:border-rose-900/60' },
];

function getMonogram(name = '') {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words[0] && words[1]) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'PR';
}

function getProjectTheme(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return PROJECT_THEMES[Math.abs(hash) % PROJECT_THEMES.length];
}

const renderStateBadge = (state) => {
  if (state === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (state === 'DRAFT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Draft
      </span>
    );
  }
  if (state === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Archived
    </span>
  );
};

function formatSmartDueDate(dueDateStr) {
  if (!dueDateStr) return null;
  const due = new Date(dueDateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(due);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `Overdue by ${Math.abs(diffDays)}d`, tone: 'danger' };
  }
  if (diffDays === 0) {
    return { text: 'Due today', tone: 'warning' };
  }
  if (diffDays === 1) {
    return { text: 'Due tomorrow', tone: 'warning' };
  }
  if (diffDays <= 7) {
    return { text: `Due in ${diffDays}d`, tone: 'neutral' };
  }
  return {
    text: `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    tone: 'neutral',
  };
}

/**
 * Minimalist ProjectCard with top accent bar, monogram, state indicator,
 * smart due date, and role badge.
 */
const ProjectCard = ({ project, onClick }) => {
  const monogram = getMonogram(project.name);
  const theme = getProjectTheme(project.id);
  const dueInfo = formatSmartDueDate(project.dueDate);

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl border border-border bg-surface shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-primary/40 cursor-pointer flex flex-col justify-between overflow-hidden"
    >
      {/* Subtle top accent bar */}
      <div className={`h-1 w-full ${theme.accent}`} />

      <div className="p-5">
        {/* Top: Monogram + Title + Arrow */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs tracking-wider border shrink-0 ${theme.badge}`}
            >
              {monogram}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-content group-hover:text-primary transition-colors truncate">
                {project.name}
              </h3>
              <div className="mt-0.5 flex items-center gap-2">
                {renderStateBadge(project.state)}
                {project.startDate && (
                  <span className="text-[11px] text-content-muted">
                    Started {new Date(project.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="p-1 text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0">
            <LuArrowRight className="w-4 h-4" />
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-content-muted line-clamp-2 leading-relaxed">
          {project.description || 'No description provided for this initiative.'}
        </p>
      </div>

      {/* Footer Info */}
      <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-[11px]">
          {dueInfo ? (
            <span
              className={`inline-flex items-center gap-1 ${
                dueInfo.tone === 'danger'
                  ? 'text-rose-600 dark:text-rose-400 font-semibold'
                  : dueInfo.tone === 'warning'
                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                  : 'text-content-muted'
              }`}
            >
              <LuCalendar className="w-3.5 h-3.5 shrink-0 opacity-80" />
              {dueInfo.text}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-content-muted/70">
              <LuCalendar className="w-3.5 h-3.5 shrink-0 opacity-50" />
              No deadline
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {project.viewer?.projectRole === 'PROJECT_MANAGER' ? (
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <LuShield className="w-3 h-3" />
              Lead
            </span>
          ) : project.viewer?.projectRole === 'CONTRIBUTOR' ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <LuUserCheck className="w-3 h-3" />
              Member
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-content-muted">
              <LuUsers className="w-3 h-3" />
              Workspace
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const ProjectListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useUserAuth();
  const isOrgAdmin = role === 'owner' || role === 'admin';
  const shouldCreate = searchParams.get('create') === 'true';

  const { data: projects = [], isLoading, isError, error, refetch } = useGetProjectsQuery();
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();

  const [activeTab, setActiveTab] = useState('ALL');
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  // Create Project Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [createError, setCreateError] = useState('');
  const [createdProject, setCreatedProject] = useState(null);

  // Group projects into tiers
  const activeProjects = useMemo(
    () => projects.filter((p) => p.state === 'ACTIVE'),
    [projects]
  );

  const draftProjects = useMemo(
    () => projects.filter((p) => p.state === 'DRAFT'),
    [projects]
  );

  const completedProjects = useMemo(
    () => projects.filter((p) => p.state === 'COMPLETED' || p.state === 'ARCHIVED'),
    [projects]
  );

  // When filtered by specific tab
  const tabFilteredProjects = useMemo(() => {
    if (activeTab === 'ALL') return projects;
    return projects.filter((p) => p.state === activeTab);
  }, [projects, activeTab]);

  useEffect(() => {
    if (shouldCreate && isOrgAdmin) {
      setIsCreateOpen(true);
    }
  }, [shouldCreate, isOrgAdmin]);

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
        setCreateError(
          'Project was created, but its setup link could not be loaded. Refresh the project list and try again.'
        );
      }
    } catch (err) {
      setCreateError(err?.data?.message || err?.message || 'Failed to create project');
    }
  };

  return (
    <DashboardLayout activeMenu="/projects">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">Projects</h1>
            <p className="text-sm text-content-muted mt-1">
              Browse, monitor and manage scoped initiatives across your organization workspace.
            </p>
          </div>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <LuPlus className="w-4 h-4" />
              Create Project
            </button>
          )}
        </div>

        {/* State Filter Tabs */}
        <div className="flex items-center gap-1.5 border-b border-border/60 pb-3 overflow-x-auto">
          {STATE_TABS.map((tab) => {
            const count =
              tab === 'ALL'
                ? projects.length
                : tab === 'ACTIVE'
                ? activeProjects.length
                : tab === 'DRAFT'
                ? draftProjects.length
                : projects.filter((p) => p.state === tab).length;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-content-muted hover:bg-surface-muted hover:text-content'
                }`}
              >
                <span>{tab.charAt(0) + tab.slice(1).toLowerCase()}</span>
                <span
                  className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                    activeTab === tab ? 'bg-white/20 text-white' : 'bg-surface-muted text-content-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
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

        {!isLoading && !isError && projects.length === 0 && (
          <EmptyState
            icon={LuFolderKanban}
            title="No projects yet"
            description={
              isOrgAdmin
                ? 'Create the first project to assemble participating teams, statuses, and manage workflows.'
                : 'No projects have been assigned or created in this workspace yet.'
            }
            action={
              isOrgAdmin ? (
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

        {/* Filtered View for Specific Tab (ACTIVE / DRAFT / COMPLETED / ARCHIVED) */}
        {!isLoading && !isError && activeTab !== 'ALL' && (
          <div>
            {tabFilteredProjects.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold text-content">
                  No {activeTab.toLowerCase()} projects
                </p>
                <p className="text-xs text-content-muted mt-1">
                  There are no projects currently in {activeTab.toLowerCase()} state.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {tabFilteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tiered View when activeTab === 'ALL' */}
        {!isLoading && !isError && activeTab === 'ALL' && projects.length > 0 && (
          <div className="space-y-8">
            {/* TIER 1: ACTIVE PROJECTS */}
            {activeProjects.length > 0 && (
              <section className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-semibold text-content">Active Projects</h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {activeProjects.length}
                    </span>
                  </div>
                  <p className="text-xs text-content-muted hidden sm:inline">
                    Initiatives currently in-flight with active workflows
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {activeProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onClick={() => navigate(`/projects/${project.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* TIER 2: PLANNING & DRAFTS */}
            {draftProjects.length > 0 && (
              <section className="space-y-3.5 pt-4 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-semibold text-content">Planning & Drafts</h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-content-muted border border-border">
                      {draftProjects.length}
                    </span>
                  </div>
                  <p className="text-xs text-content-muted hidden sm:inline">
                    Upcoming initiatives & proposals awaiting kickoff
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {draftProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onClick={() => navigate(`/projects/${project.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* TIER 3: COMPLETED & ARCHIVED (Collapsible) */}
            {completedProjects.length > 0 && (
              <section className="space-y-3.5 pt-4 border-t border-border/60">
                <div
                  onClick={() => setIsCompletedOpen((prev) => !prev)}
                  className="flex items-center justify-between cursor-pointer select-none group py-1"
                >
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-semibold text-content group-hover:text-primary transition-colors">
                      Completed & Archived
                    </h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-content-muted border border-border">
                      {completedProjects.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-content-muted group-hover:text-primary transition-colors">
                    <span>{isCompletedOpen ? 'Hide completed' : 'Show completed'}</span>
                    {isCompletedOpen ? (
                      <LuChevronUp className="w-4 h-4" />
                    ) : (
                      <LuChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {isCompletedOpen && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-1">
                    {completedProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onClick={() => navigate(`/projects/${project.id}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
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
              <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 p-4">
                <LuCircleCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    {createdProject.name} is ready to set up
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
                    A draft project was created with your General team, you as Project Manager, four starter statuses, and the default collaboration modules.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-content">Finish the setup when you are ready</h3>
                <p className="mt-1 text-xs text-content-muted">
                  These are optional next steps. You can start planning tasks immediately or refine the workspace first.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: LuUsers, title: 'Participants', description: 'Add teams and project members.' },
                  { icon: LuSettings, title: 'Workflow', description: 'Rename or reorder task statuses.' },
                  { icon: LuBoxes, title: 'Modules', description: 'Review enabled project tools.' },
                ].map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-border bg-surface-muted/60 p-3"
                  >
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    <p className="mt-2 text-xs font-semibold text-content">{title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-content-muted">{description}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    handleCloseCreate();
                    navigate(`/projects/${createdProject.id}`);
                  }}
                  className="px-4 py-2 text-xs font-medium text-content bg-surface border border-border rounded-lg hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  Go to project board
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseCreate();
                    navigate(`/projects/${createdProject.id}?setup=participants`);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 cursor-pointer"
                >
                  Continue to advanced setup
                  <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/30 p-4">
                <p className="text-sm font-semibold text-content">Start with the essentials</p>
                <p className="mt-1 text-xs leading-relaxed text-content-muted">
                  Create the project now, then continue to its setup workspace to add participants, tailor statuses, and enable the modules your team needs.
                </p>
              </div>

              {createError && (
                <div role="alert" className="p-3 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {createError}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="proj-name" className="block text-xs font-semibold text-content mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="proj-name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mobile Application Launch"
                  required
                  className="w-full px-3 py-2 text-sm bg-surface text-content border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="proj-desc" className="block text-xs font-semibold text-content mb-1">
                  Description (optional)
                </label>
                <textarea
                  id="proj-desc"
                  name="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Scope, objectives, and deliverables..."
                  className="w-full px-3 py-2 text-sm bg-surface text-content border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-surface-muted/50 p-4 border border-border">
                <div>
                  <label htmlFor="proj-start" className="block text-xs font-semibold text-content mb-1">
                    Start Date
                  </label>
                  <input
                    id="proj-start"
                    name="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface text-content border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="proj-due" className="block text-xs font-semibold text-content mb-1">
                    Due Date
                  </label>
                  <input
                    id="proj-due"
                    name="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface text-content border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div className="p-3 bg-surface-muted border border-border rounded-lg text-[11px] text-content-muted leading-relaxed">
                <strong className="text-content">Included setup:</strong> The General team is added as a participating team, you become the <strong className="text-content">Project Manager</strong>, and TaskForge initializes configurable task statuses plus Milestones, Documents, Files, and Risks.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleCloseCreate}
                  disabled={isCreating}
                  className="px-4 py-2 text-xs font-medium text-content bg-surface border border-border rounded-lg hover:bg-surface-muted disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
