import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  LuPlus,
  LuFolderKanban,
  LuCalendar,
  LuArrowRight,
  LuShield,
  LuUserCheck,
  LuCheck,
  LuList,
  LuKanban,
  LuSearch,
  LuArrowUpDown,
  LuChevronDown,
  LuExternalLink,
  LuX,
  LuUsers,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetProjectsQuery, useCreateProjectMutation } from '../../services/projectApi';
import ProjectInsightsSidebar from './components/ProjectInsightsSidebar';
import ProjectBoardView from './components/ProjectBoardView';
import CreateProjectModal from './components/CreateProjectModal';

const STATE_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'DRAFT', label: 'Backlog & Planning' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'ARCHIVED', label: 'Archived' },
];

const PROJECT_THEMES = [
  { accent: 'bg-indigo-600', badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200/60' },
  { accent: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/60' },
  { accent: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200/60' },
  { accent: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200/60' },
  { accent: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200/60' },
  { accent: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200/60' },
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
    text: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'neutral',
  };
}

const ProjectListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission, activeOrganization, activeOrganizationId, user } = useUserAuth();
  const canCreateProject = hasPermission('org.projects.create');
  const shouldCreate = searchParams.get('create') === 'true';

  const { data: projects = [], isLoading, isError, error, refetch } = useGetProjectsQuery();
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();

  // Navigation & View States
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [leadFilter, setLeadFilter] = useState('ALL'); // 'ALL' | 'MINE'
  const [healthFilter, setHealthFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'DRAFT'
  const [sortBy, setSortBy] = useState('targetDate'); // 'targetDate' | 'name'
  const [hideCompleted, setHideCompleted] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Create Project Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsShortcutsOpen(false);
        setIsCreateOpen(false);
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (canCreateProject) setIsCreateOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canCreateProject]);

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
    () => projects.filter((p) => p.state === 'COMPLETED'),
    [projects]
  );

  const archivedProjects = useMemo(
    () => projects.filter((p) => p.state === 'ARCHIVED'),
    [projects]
  );

  const completedAndArchived = useMemo(
    () => projects.filter((p) => p.state === 'COMPLETED' || p.state === 'ARCHIVED'),
    [projects]
  );

  // Tab counts
  const tabCounts = useMemo(() => ({
    ALL: projects.length,
    ACTIVE: activeProjects.length,
    DRAFT: draftProjects.length,
    COMPLETED: completedProjects.length,
    ARCHIVED: archivedProjects.length,
  }), [projects, activeProjects, draftProjects, completedProjects, archivedProjects]);

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let list = projects;

    if (activeTab !== 'ALL') {
      list = list.filter((p) => p.state === activeTab);
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    if (leadFilter === 'MINE') {
      list = list.filter((p) => p.viewer?.projectRole === 'PROJECT_MANAGER');
    }

    if (healthFilter !== 'ALL') {
      list = list.filter((p) => p.state === healthFilter);
    }

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === 'targetDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    return list;
  }, [projects, activeTab, searchFilter, leadFilter, healthFilter, sortBy]);

  useEffect(() => {
    if (shouldCreate && canCreateProject) {
      setIsCreateOpen(true);
    }
    if (!canCreateProject) setIsCreateOpen(false);
  }, [shouldCreate, canCreateProject, activeOrganizationId]);

  const handleOpenCreate = () => {
    if (!canCreateProject) return;
    setIsCreateOpen(true);
  };

  const handleCloseCreate = () => {
    if (isCreating) return;
    setIsCreateOpen(false);
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Name', 'State', 'Start Date', 'Due Date', 'Role', 'Description'];
    const rows = projects.map((p) => [
      p.id,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      p.state,
      p.startDate || '',
      p.dueDate || '',
      p.viewer?.projectRole || '',
      `"${(p.description || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `taskforge-projects-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderHealthBadge = (project) => {
    if (project.state === 'ACTIVE') {
      return (
        <span className="inline-flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[11px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>On track</span>
          <span className="text-content-muted">· Active</span>
        </span>
      );
    }
    if (project.state === 'DRAFT') {
      return (
        <span className="inline-flex items-center space-x-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded text-[11px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>Scoping</span>
          <span className="text-content-muted">· Draft</span>
        </span>
      );
    }
    if (project.state === 'COMPLETED') {
      return (
        <span className="inline-flex items-center space-x-1.5 text-content font-medium text-xs">
          <LuCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Completed</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1.5 text-content-muted text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-content-muted/50" />
        <span>Archived</span>
      </span>
    );
  };

  const renderProjectRow = (project) => {
    const monogram = getMonogram(project.name);
    const theme = getProjectTheme(project.id);
    const dueInfo = formatSmartDueDate(project.dueDate);
    const progress =
      project.state === 'COMPLETED'
        ? 100
        : project.state === 'ARCHIVED'
        ? 100
        : project.state === 'DRAFT'
        ? 45
        : 72;

    const isManager = project.viewer?.projectRole === 'PROJECT_MANAGER';
    const leadName = isManager ? (user?.name || 'Alex Johnson') : 'Team Lead';
    const leadInitials = isManager ? getMonogram(user?.name || 'Alex Johnson') : 'TL';

    return (
      <div
        key={project.id}
        onClick={() => navigate(`/projects/${project.id}`)}
        className="group grid grid-cols-12 gap-3 items-center px-3 py-2.5 rounded-md hover:bg-surface-muted/60 border-b border-border/40 transition-colors cursor-pointer"
      >
        {/* Project Name & Description */}
        <div className="col-span-12 sm:col-span-5 flex items-center space-x-2.5 min-w-0">
          <span
            className={`w-5 h-5 rounded font-semibold text-[10px] flex items-center justify-center shrink-0 border ${theme.badge}`}
          >
            {monogram}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-content group-hover:text-primary transition-colors truncate">
                {project.name}
              </span>
              <span className="hidden md:inline-flex text-[10px] font-mono text-content-muted bg-surface-muted px-1 rounded border border-border/40">
                {project.state === 'ACTIVE' ? 'Q4' : project.state === 'DRAFT' ? 'Draft' : project.state}
              </span>
            </div>
            <p className="text-[11px] text-content-muted truncate max-w-sm mt-0.5">
              {project.description || 'No description provided.'}
            </p>
          </div>
        </div>

        {/* Health / State */}
        <div className="hidden sm:flex sm:col-span-2 items-center space-x-2">
          {renderHealthBadge(project)}
        </div>

        {/* Lead */}
        <div className="hidden sm:flex sm:col-span-2 items-center space-x-1.5 min-w-0">
          <div className="w-4 h-4 rounded-full bg-zinc-800 text-white text-[8px] font-medium flex items-center justify-center shrink-0">
            {leadInitials}
          </div>
          <span className="text-xs text-content-muted truncate">{leadName}</span>
        </div>

        {/* Target Date */}
        <div className="hidden sm:block sm:col-span-1 text-xs text-content-muted font-mono">
          {dueInfo ? dueInfo.text : 'No target'}
        </div>

        {/* Progress */}
        <div className="hidden sm:flex sm:col-span-2 items-center justify-end space-x-2.5">
          {project.state === 'COMPLETED' ? (
            <span className="text-xs text-content-muted font-mono">100% · 14 sign-offs</span>
          ) : project.state === 'ARCHIVED' ? (
            <span className="text-xs text-content-muted font-mono">All nodes retired</span>
          ) : (
            <>
              <div className="w-16 bg-surface-muted border border-border/40 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`${theme.accent} h-full rounded-full transition-all`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-content font-mono font-medium">{progress}%</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout activeMenu="/projects">
      <div className="space-y-5 pb-12 select-none">
        {/* Header Breadcrumb & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2 text-xs text-content-muted mb-1">
              <Link to="/dashboard" className="hover:text-content transition-colors">
                TaskForge
              </Link>
              <span>/</span>
              <span>{activeOrganization?.name || 'TaskForge HQ'}</span>
              <span>/</span>
              <span className="text-content font-medium">Projects</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-content">Projects</h1>
              <span className="text-xs text-content-muted font-mono">
                {activeProjects.length} active · {projects.length} total
              </span>
            </div>
          </div>

          {/* Secondary Toolbar: Views & New Project */}
          <div className="flex items-center space-x-2 self-start md:self-auto">
            {/* View Mode Switcher */}
            <div className="inline-flex p-0.5 bg-surface-muted rounded-md text-xs border border-border">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 font-medium rounded flex items-center space-x-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-surface text-content shadow-xs font-semibold'
                    : 'text-content-muted hover:text-content'
                }`}
              >
                <LuList className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`px-2.5 py-1 font-medium rounded flex items-center space-x-1.5 transition-all cursor-pointer ${
                  viewMode === 'board'
                    ? 'bg-surface text-content shadow-xs font-semibold'
                    : 'text-content-muted hover:text-content'
                }`}
              >
                <LuKanban className="w-3.5 h-3.5" />
                <span>Board</span>
              </button>
            </div>

            {/* New Project Button */}
            {canCreateProject && <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-medium px-3 py-1.5 rounded-md shadow-2xs transition-colors cursor-pointer"
            >
              <LuPlus className="w-3.5 h-3.5" />
              <span>New Project</span>
            </button>}
          </div>
        </div>

        {/* Linear Tabs Strip */}
        <div className="flex items-center space-x-5 text-xs border-b border-border overflow-x-auto">
          {STATE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2.5 font-medium flex items-center space-x-1.5 transition-colors whitespace-nowrap cursor-pointer border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-content border-primary font-semibold'
                  : 'text-content-muted hover:text-content border-transparent'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] text-content-muted font-mono bg-surface-muted px-1.5 py-0.5 rounded border border-border/40">
                {tabCounts[tab.id] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Filter Controls Strip */}
        <div className="py-2 border-b border-border bg-surface-muted/30 px-3 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter projects..."
                className="pl-7 pr-2.5 py-1 text-xs bg-surface border border-border rounded-md text-content placeholder-content-muted focus:outline-none focus:border-primary w-44 lg:w-56 transition-all"
              />
              <LuSearch className="w-3.5 h-3.5 text-content-muted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Lead Filter Chip */}
            <div className="relative inline-block">
              <select
                value={leadFilter}
                onChange={(e) => setLeadFilter(e.target.value)}
                className="appearance-none text-xs bg-surface border border-border text-content px-2 py-1 pr-6 rounded-md hover:bg-surface-muted cursor-pointer focus:outline-none"
              >
                <option value="ALL">Lead: Anyone</option>
                <option value="MINE">Lead: Managed by me</option>
              </select>
              <LuChevronDown className="w-3 h-3 text-content-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Health Filter Chip */}
            <div className="relative inline-block">
              <select
                value={healthFilter}
                onChange={(e) => setHealthFilter(e.target.value)}
                className="appearance-none text-xs bg-surface border border-border text-content px-2 py-1 pr-6 rounded-md hover:bg-surface-muted cursor-pointer focus:outline-none"
              >
                <option value="ALL">Health: All</option>
                <option value="ACTIVE">Health: Active</option>
                <option value="DRAFT">Health: Scoping (Draft)</option>
              </select>
              <LuChevronDown className="w-3 h-3 text-content-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Sort Control */}
          <button
            type="button"
            onClick={() => setSortBy(sortBy === 'targetDate' ? 'name' : 'targetDate')}
            className="flex items-center space-x-1.5 text-content-muted hover:text-content py-1 transition-colors cursor-pointer"
          >
            <LuArrowUpDown className="w-3.5 h-3.5 text-content-muted" />
            <span>Sort by {sortBy === 'targetDate' ? 'target date' : 'name'}</span>
          </button>
        </div>

        {/* Loading / Error States */}
        {isLoading && <LoadingState message="Loading projects..." />}
        {isError && (
          <ErrorState
            title="Unable to load projects"
            message={error?.data?.message || 'Failed to fetch projects in this workspace.'}
            onRetry={refetch}
          />
        )}

        {/* Empty State */}
        {!isLoading && !isError && projects.length === 0 && (
          <EmptyState
            icon={LuFolderKanban}
            title="No projects yet"
            description={
              canCreateProject
                ? 'Create the first project to assemble participating teams, statuses, and manage workflows.'
                : 'No projects have been assigned or created in this workspace yet.'
            }
            action={
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                <LuPlus className="w-4 h-4" />
                New Project
              </button>
            }
          />
        )}

        {/* Main Feed + Insights Layout */}
        {!isLoading && !isError && projects.length > 0 && (
          <div className="flex gap-6 items-start">
            {/* Main Area: List or Board View */}
            <div className="flex-1 min-w-0 space-y-6">
              {viewMode === 'board' ? (
                <ProjectBoardView
                  projects={filteredProjects}
                  onProjectClick={(id) => navigate(`/projects/${id}`)}
                  getMonogram={getMonogram}
                  getProjectTheme={getProjectTheme}
                  formatSmartDueDate={formatSmartDueDate}
                />
              ) : (
                /* High-Density Linear Table View */
                <div className="space-y-6 bg-surface border border-border rounded-xl p-4 shadow-xs">
                  {/* Table Column Titles */}
                  <div className="grid grid-cols-12 gap-3 px-3 py-1.5 text-[11px] font-medium text-content-muted uppercase tracking-wider border-b border-border/40">
                    <div className="col-span-12 sm:col-span-5">Project</div>
                    <div className="hidden sm:block sm:col-span-2">Health / State</div>
                    <div className="hidden sm:block sm:col-span-2">Lead</div>
                    <div className="hidden sm:block sm:col-span-1">Target</div>
                    <div className="hidden sm:block sm:col-span-2 text-right">Progress</div>
                  </div>

                  {/* GROUP 1: ACTIVE */}
                  {(activeTab === 'ALL' || activeTab === 'ACTIVE') && activeProjects.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border/40 px-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-content">Active</span>
                          <span className="text-xs text-content-muted font-mono">{activeProjects.length}</span>
                        </div>
                        <span className="text-[11px] text-content-muted">
                          In flight &amp; active sprint workflows
                        </span>
                      </div>
                      <div className="divide-y divide-border/20">
                        {activeProjects
                          .filter((p) => filteredProjects.some((f) => f.id === p.id))
                          .map(renderProjectRow)}
                      </div>
                    </div>
                  )}

                  {/* GROUP 2: BACKLOG & PLANNING (DRAFT) */}
                  {(activeTab === 'ALL' || activeTab === 'DRAFT') && draftProjects.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border/40 px-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-content">Backlog &amp; Planning</span>
                          <span className="text-xs text-content-muted font-mono">{draftProjects.length}</span>
                        </div>
                        <span className="text-[11px] text-content-muted">
                          Proposals awaiting architecture kickoff
                        </span>
                      </div>
                      <div className="divide-y divide-border/20">
                        {draftProjects
                          .filter((p) => filteredProjects.some((f) => f.id === p.id))
                          .map(renderProjectRow)}
                      </div>
                    </div>
                  )}

                  {/* GROUP 3: COMPLETED & ARCHIVED */}
                  {(activeTab === 'ALL' || activeTab === 'COMPLETED' || activeTab === 'ARCHIVED') &&
                    completedAndArchived.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <div className="flex items-center justify-between pb-1.5 border-b border-border/40 px-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-content">Completed &amp; Archived</span>
                            <span className="text-xs text-content-muted font-mono">
                              {completedAndArchived.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setHideCompleted(!hideCompleted)}
                            className="text-[11px] text-content-muted hover:text-content transition-colors cursor-pointer"
                          >
                            {hideCompleted ? 'Show completed' : 'Hide completed'}
                          </button>
                        </div>
                        {!hideCompleted && (
                          <div className="divide-y divide-border/20">
                            {completedAndArchived
                              .filter((p) => filteredProjects.some((f) => f.id === p.id))
                              .map(renderProjectRow)}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Subtle Insights Sidebar (Right Rail) */}
            <ProjectInsightsSidebar onExport={handleExportCsv} />
          </div>
        )}

        {/* Create Project Modal */}
        {isCreateOpen && canCreateProject && (
          <CreateProjectModal
            isOpen={isCreateOpen}
            onClose={handleCloseCreate}
            onCreateProject={async (payload) => {
              const created = await createProject(payload).unwrap();
              refetch();
              return created;
            }}
            isCreating={isCreating}
          />
        )}

        {/* Shortcuts Reference Modal */}
        {isShortcutsOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            onClick={() => setIsShortcutsOpen(false)}
          >
            <div
              className="w-full max-w-sm bg-surface rounded-2xl border border-border p-5 shadow-xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-content">Projects Shortcuts</h3>
                <button
                  type="button"
                  onClick={() => setIsShortcutsOpen(false)}
                  className="p-1 rounded text-content-muted hover:text-content"
                >
                  <LuX className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y divide-border/60 text-xs">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-content-muted">Create new project</span>
                  <kbd className="px-1.5 py-0.5 font-mono bg-surface-muted border border-border rounded text-[10px]">C</kbd>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-content-muted">Toggle shortcuts reference</span>
                  <kbd className="px-1.5 py-0.5 font-mono bg-surface-muted border border-border rounded text-[10px]">?</kbd>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-content-muted">Close modal or dialog</span>
                  <kbd className="px-1.5 py-0.5 font-mono bg-surface-muted border border-border rounded text-[10px]">Esc</kbd>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sleek Bottom Status Bar */}
      <aside className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => setIsShortcutsOpen(true)}
          className="flex items-center gap-2 bg-surface/90 backdrop-blur-md border border-border text-content-muted px-3 py-1.5 rounded-md shadow-md hover:shadow-lg hover:border-primary/40 text-[11px] font-medium transition-all cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-content">Synced / production-us-east-1</span>
          <span className="text-border">|</span>
          <span className="text-content-muted">
            Press <kbd className="font-mono bg-surface-muted px-1 py-0.5 rounded text-content border border-border">?</kbd> for shortcuts
          </span>
        </button>
      </aside>
    </DashboardLayout>
  );
};

export default ProjectListPage;
