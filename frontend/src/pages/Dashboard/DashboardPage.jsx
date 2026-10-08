import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  LuListTodo,
  LuCircleCheck,
  LuTriangleAlert,
  LuFilter,
  LuClock,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/PageState.jsx';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetDashboardQuery, dashboardApi } from '../../services/dashboardApi.js';
import { useResolveApprovalMutation } from '../../services/taskApi.js';
import { useDispatch } from 'react-redux';
import { DashboardSchedule } from './components/DashboardSchedule.jsx';
import {
  PriorityDistributionCard,
  WorkflowStagesCard,
} from './components/DashboardCharts.jsx';
import {
  PriorityBars,
  LinearStatusIcon,
} from '../../components/task/index.js';
import { isTaskOverdue } from '../../utils/taskAttention.js';

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const PROJECT_STATE_CONFIG = {
  ACTIVE: { label: 'Active', dotColor: 'bg-emerald-500' },
  DRAFT: { label: 'Draft', dotColor: 'bg-amber-500' },
  COMPLETED: { label: 'Done', dotColor: 'bg-zinc-400' },
  ARCHIVED: { label: 'Archived', dotColor: 'bg-zinc-300 dark:bg-zinc-600' },
};

const DashboardPage = () => {
  const dispatch = useDispatch();
  const {
    activeOrganization,
    activeOrganizationId,
    organizationsInitialized,
  } = useUserAuth();

  const workspacePending = !organizationsInitialized;
  const noActiveWorkspace = organizationsInitialized && !activeOrganizationId;

  const { data, isLoading, isError, error, refetch } = useGetDashboardQuery(undefined, {
    skip: workspacePending || noActiveWorkspace,
  });

  const [resolveApproval, { isLoading: isResolving }] = useResolveApprovalMutation();
  const [resolvingId, setResolvingId] = useState(null);

  const week = useMemo(() => nextSevenDays(), []);

  const calendarItemsByDay = useMemo(() => {
    const items = new Map();
    for (const item of data?.calendarItems || []) {
      const key = calendarDayKey(item.date);
      const current = items.get(key) || [];
      current.push(item);
      items.set(key, current);
    }
    return items;
  }, [data?.calendarItems]);

  const rawAssignedTasks = data?.assignedTasks || [];
  const pendingApprovals = data?.pendingApprovals || [];
  const recentProjects = data?.recentProjects || [];
  const calendarItems = data?.calendarItems || [];
  const focus = data?.focus || emptyFocus();

  // Sort assigned tasks: Overdue first, active next by priority, completed last
  const assignedTasks = useMemo(() => {
    return [...rawAssignedTasks].sort((a, b) => {
      const aOverdue = isTaskOverdue(a.dueAt, a.semanticCategory);
      const bOverdue = isTaskOverdue(b.dueAt, b.semanticCategory);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      const aTerminal = a.semanticCategory === 'COMPLETED' || a.semanticCategory === 'CANCELLED';
      const bTerminal = b.semanticCategory === 'COMPLETED' || b.semanticCategory === 'CANCELLED';
      if (!aTerminal && bTerminal) return -1;
      if (aTerminal && !bTerminal) return 1;

      const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const aPri = priorityOrder[String(a.priorityCode || '').toUpperCase()] || 0;
      const bPri = priorityOrder[String(b.priorityCode || '').toUpperCase()] || 0;
      if (aPri !== bPri) return bPri - aPri;

      if (a.dueAt && b.dueAt) {
        return new Date(a.dueAt) - new Date(b.dueAt);
      }
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;

      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }, [rawAssignedTasks]);

  // Counts for active work breakdown
  const inProgressCount = useMemo(() => {
    return rawAssignedTasks.filter((t) => String(t.semanticCategory || '').toUpperCase() === 'IN_PROGRESS').length;
  }, [rawAssignedTasks]);

  const inReviewCount = useMemo(() => {
    return rawAssignedTasks.filter((t) => {
      const cat = String(t.semanticCategory || '').toUpperCase();
      return cat === 'IN_REVIEW' || cat === 'REVIEW';
    }).length;
  }, [rawAssignedTasks]);

  const firstDueTodayTask = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    return rawAssignedTasks.find((t) => {
      if (!t.dueAt) return false;
      const due = new Date(t.dueAt);
      return due >= startOfToday && due < startOfTomorrow && t.semanticCategory !== 'COMPLETED';
    });
  }, [rawAssignedTasks]);

  const completionPercentage = useMemo(() => {
    const total = focus.total || 0;
    if (total === 0) return 0;
    return Math.round(((focus.completed || 0) / total) * 100);
  }, [focus.completed, focus.total]);

  const handleQuickApproval = async (approval, action) => {
    setResolvingId(approval.id);
    try {
      await resolveApproval({
        projectId: approval.projectId,
        taskId: approval.taskId,
        action,
      }).unwrap();
      toast.success(`Task ${action === 'approve' ? 'approved' : 'rejected'} successfully.`);
      dispatch(dashboardApi.util.invalidateTags(['Dashboard']));
      refetch();
    } catch (err) {
      toast.error(err?.data?.message || `Failed to ${action} task.`);
    } finally {
      setResolvingId(null);
    }
  };

  if (workspacePending || isLoading) {
    return (
      <DashboardLayout activeMenu="/dashboard">
        <div className="mx-auto my-6 max-w-7xl">
          <LoadingState label="Loading your workspace dashboard..." />
        </div>
      </DashboardLayout>
    );
  }

  if (noActiveWorkspace) {
    return (
      <DashboardLayout activeMenu="/dashboard">
        <div className="space-y-5 pb-12">
          <h1 className="text-2xl font-bold text-content">Dashboard</h1>
          <EmptyState
            title="Welcome to TaskForge"
            description="Create a workspace to start organizing your projects and tasks."
          />
          <div className="text-center">
            <Link to="/workspace/onboarding" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Create workspace
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout activeMenu="/dashboard">
        <div className="space-y-5 pb-12">
          <ErrorState
            title="Unable to load your dashboard"
            message={error?.data?.message || 'Your workspace data could not be loaded. Try again in a moment.'}
            onRetry={refetch}
          />
        </div>
      </DashboardLayout>
    );
  }

  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  return (
    <DashboardLayout activeMenu="/dashboard">
      <div className="space-y-5 pb-12 select-none">
        {/* Header Section: Clean, restrained & informative (Linear / Stripe style) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2 text-xs text-content-muted font-medium">
              <span>{todayLabel}</span>
              <span className="text-content-muted/60">•</span>
              <span>{activeOrganization?.name || 'Workspace'}</span>
            </div>
            <h1 className="text-xl font-semibold text-content tracking-tight mt-0.5">
              Overview
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/tasks/my"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-content-muted hover:text-content bg-surface border border-border px-2.5 py-1.5 rounded-md shadow-2xs hover:bg-surface-muted transition-colors cursor-pointer"
            >
              <LuFilter className="w-3.5 h-3.5 text-content-muted" />
              <span>Filter</span>
            </Link>
            <Link
              to="/tasks/my"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-content hover:text-primary bg-surface border border-border px-2.5 py-1.5 rounded-md shadow-2xs hover:bg-surface-muted transition-colors cursor-pointer"
            >
              <LuListTodo className="w-3.5 h-3.5 text-content-muted" />
              <span>My Tasks</span>
            </Link>
          </div>
        </div>

        {/* 1. Restrained Minimalist KPI Cards (Linear / Stripe Style) */}
        <section aria-label="KPI metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Metric 1: Active Assignments */}
          <Link
            to="/tasks/my"
            className="bg-surface border border-border rounded-lg p-3.5 shadow-xs hover:border-border/80 transition-colors block group cursor-pointer"
          >
            <div className="text-[11px] font-medium text-content-muted uppercase tracking-wider">
              Active Assignments
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-content tracking-tight group-hover:text-primary transition-colors">
                {focus.active}
              </span>
              <span className="text-xs text-content-muted">of {focus.total} assigned</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-content-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>
                {inProgressCount} in progress{inReviewCount > 0 ? `, ${inReviewCount} in review` : ''}
              </span>
            </div>
          </Link>

          {/* Metric 2: Due Today */}
          <Link
            to="/tasks/my"
            className="bg-surface border border-border rounded-lg p-3.5 shadow-xs hover:border-border/80 transition-colors block group cursor-pointer"
          >
            <div className="text-[11px] font-medium text-content-muted uppercase tracking-wider">
              Due Today
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-content tracking-tight group-hover:text-primary transition-colors">
                {focus.dueToday}
              </span>
              {firstDueTodayTask ? (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium truncate max-w-[130px]">
                  {firstDueTodayTask.title}
                </span>
              ) : (
                <span className="text-xs text-content-muted font-medium">All caught up</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-content-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>{focus.upcoming} upcoming this week</span>
            </div>
          </Link>

          {/* Metric 3: Overdue Tasks (Smart zero-state handling) */}
          <Link
            to="/tasks/my"
            className="bg-surface border border-border rounded-lg p-3.5 shadow-xs hover:border-border/80 transition-colors block group cursor-pointer"
          >
            <div className="text-[11px] font-medium text-content-muted uppercase tracking-wider">
              Overdue Tasks
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-content tracking-tight group-hover:text-primary transition-colors">
                {focus.overdue}
              </span>
              {focus.overdue === 0 ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  On track
                </span>
              ) : (
                <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  Action required
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-content-muted">
              {focus.overdue === 0 ? (
                <>
                  <LuCircleCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>All milestones healthy</span>
                </>
              ) : (
                <>
                  <LuTriangleAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="text-rose-600 dark:text-rose-400">
                    {focus.overdue} past deadline
                  </span>
                </>
              )}
            </div>
          </Link>

          {/* Metric 4: Approval Requests */}
          <Link
            to="/tasks/approval-queue"
            className="bg-surface border border-border rounded-lg p-3.5 shadow-xs hover:border-border/80 transition-colors block group cursor-pointer"
          >
            <div className="text-[11px] font-medium text-content-muted uppercase tracking-wider">
              Approval Requests
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-content tracking-tight group-hover:text-primary transition-colors">
                {pendingApprovals.length}
              </span>
              <span className="text-xs text-content-muted">
                {pendingApprovals.length > 0 ? 'pending review' : 'cleared'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-content-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
              <span>Assigned to you</span>
            </div>
          </Link>
        </section>

        {/* 2. Visual Analytics (Sleek Segmented Bar & SVG Donut Chart) */}
        <section aria-label="Visual Analytics" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PriorityDistributionCard
            tasks={assignedTasks}
            focus={focus}
          />
          <WorkflowStagesCard
            tasks={assignedTasks}
            focus={focus}
            completionPercentage={completionPercentage}
          />
        </section>

        {/* 3. Schedule Strip & Approvals Row (7 cols / 5 cols) */}
        <section aria-label="Timeline and Approvals" className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 7-Day Timeline Strip (7 cols) */}
          <div className="lg:col-span-7">
            <DashboardSchedule
              week={week}
              calendarItemsByDay={calendarItemsByDay}
              totalItemsCount={calendarItems.length}
            />
          </div>

          {/* Approval Queue (5 cols) */}
          <div className="lg:col-span-5 bg-surface border border-border rounded-lg p-4 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-content uppercase tracking-wider">
                    Approval Queue
                  </h3>
                  {pendingApprovals.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  )}
                </div>
                <Link
                  to="/tasks/approval-queue"
                  className="text-[11px] font-medium text-content-muted hover:text-content transition-colors"
                >
                  View all ({pendingApprovals.length})
                </Link>
              </div>

              {/* Approval Items */}
              {pendingApprovals.length === 0 ? (
                <div className="my-8 text-center space-y-1.5 text-content-muted">
                  <LuCircleCheck className="w-7 h-7 text-emerald-500 mx-auto opacity-80" />
                  <p className="text-xs font-semibold text-content">No approvals pending</p>
                  <p className="text-[11px]">
                    You have reviewed and cleared all task completion requests.
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {pendingApprovals.slice(0, 2).map((approval) => (
                    <div
                      key={approval.id}
                      className="p-3 rounded-md border border-border/80 bg-surface-muted/50 hover:bg-surface-muted transition-colors text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="font-mono text-content-muted">
                          DEC-{approval.taskId.slice(0, 4).toUpperCase()}
                        </span>
                        <span className="text-content-muted">
                          {formatShortDate(approval.requestedAt)}
                        </span>
                      </div>
                      <Link
                        to={taskHref(approval.projectId, approval.taskId)}
                        className="font-semibold text-content hover:text-primary transition-colors line-clamp-1 block"
                      >
                        {approval.title}
                      </Link>
                      <p className="text-[11px] text-content-muted mt-0.5 truncate">
                        {approval.projectName}
                      </p>

                      <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/60">
                        <span className="text-[11px] text-content-muted">
                          Requires Owner sign-off
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isResolving && resolvingId === approval.id}
                            onClick={() => handleQuickApproval(approval, 'reject')}
                            className="px-2 py-1 text-[11px] font-medium text-content-muted hover:text-content bg-surface border border-border rounded shadow-2xs hover:bg-surface-muted transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            disabled={isResolving && resolvingId === approval.id}
                            onClick={() => handleQuickApproval(approval, 'approve')}
                            className="px-2 py-1 text-[11px] font-medium text-white bg-content hover:bg-content/90 dark:bg-primary dark:hover:bg-primary/90 rounded shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2.5 mt-2 border-t border-border/60 text-right">
              <Link
                to="/tasks/approval-queue"
                className="text-[11px] font-medium text-content-muted hover:text-content transition-colors"
              >
                Manage approval workflows →
              </Link>
            </div>
          </div>
        </section>

        {/* 4. Bottom Workspaces: Assigned Tasks & Recent Projects (7 cols / 5 cols) */}
        <section aria-label="Assigned Tasks and Recent Projects" className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Assigned Tasks (7 cols) */}
          <div className="lg:col-span-7 bg-surface border border-border rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div>
                <h3 className="text-xs font-semibold text-content uppercase tracking-wider">
                  Assigned to You
                </h3>
                <p className="text-[11px] text-content-muted">Your direct queue and progress</p>
              </div>
              <Link
                to="/tasks/my"
                className="text-[11px] font-medium text-content-muted hover:text-content transition-colors"
              >
                All tasks ({assignedTasks.length}) →
              </Link>
            </div>

            {/* Linear-style Clean Issue List */}
            {assignedTasks.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  title="No assigned tasks"
                  description="Tasks assigned to you will show up here."
                />
              </div>
            ) : (
              <div className="mt-2 divide-y divide-border/60 text-xs">
                {assignedTasks.slice(0, 5).map((task) => {
                  const isCompleted = String(task.semanticCategory || '').toUpperCase() === 'COMPLETED';
                  const isOverdue = isTaskOverdue(task.dueAt, task.semanticCategory);
                  const taskKey = `TF-${task.id.slice(0, 4).toUpperCase()}`;

                  return (
                    <Link
                      key={task.id}
                      to={taskHref(task.projectId, task.id)}
                      className="py-2.5 flex items-center justify-between gap-3 group hover:bg-surface-muted/60 -mx-2 px-2 rounded transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <LinearStatusIcon category={task.semanticCategory} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-content-muted shrink-0">
                              {taskKey}
                            </span>
                            <span
                              className={`font-medium truncate transition-colors ${
                                isCompleted
                                  ? 'line-through text-content-muted'
                                  : 'text-content group-hover:text-primary'
                              }`}
                            >
                              {task.title}
                            </span>
                          </div>
                          <div className="text-[11px] text-content-muted truncate mt-0.5">
                            {task.projectName}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-[11px]">
                        <PriorityBars priority={task.priorityCode} />
                        <span
                          className={`font-mono text-[11px] ${
                            isOverdue
                              ? 'text-rose-600 dark:text-rose-400 font-medium'
                              : 'text-content-muted'
                          }`}
                        >
                          {task.dueAt ? formatShortDate(task.dueAt) : '—'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Active Projects (5 cols) */}
          <div className="lg:col-span-5 bg-surface border border-border rounded-lg p-4 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div>
                  <h3 className="text-xs font-semibold text-content uppercase tracking-wider">
                    Active Projects
                  </h3>
                  <p className="text-[11px] text-content-muted">Workspaces &amp; repositories</p>
                </div>
                <Link
                  to="/projects"
                  className="text-[11px] font-medium text-content-muted hover:text-content transition-colors"
                >
                  All projects ({recentProjects.length}) →
                </Link>
              </div>

              {/* Modern Craft Project Rows */}
              {recentProjects.length === 0 ? (
                <div className="py-8">
                  <EmptyState
                    title="No visible projects"
                    description="Projects you join or create will be listed here."
                  />
                </div>
              ) : (
                <div className="mt-2 divide-y divide-border/60 text-xs">
                  {recentProjects.slice(0, 5).map((project) => {
                    const stateCfg = PROJECT_STATE_CONFIG[project.state] || {
                      label: project.state || 'Active',
                      dotColor: 'bg-zinc-400',
                    };

                    return (
                      <Link
                        key={project.id}
                        to={`/projects/${project.id}`}
                        className="py-2.5 flex items-center justify-between group hover:bg-surface-muted/60 -mx-2 px-2 rounded transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-5 h-5 rounded bg-surface-muted border border-border flex items-center justify-center font-mono text-[10px] font-semibold text-content shrink-0">
                            {project.name?.charAt(0)?.toUpperCase() || 'P'}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-medium text-content group-hover:text-primary truncate transition-colors leading-tight">
                              {project.name}
                            </h4>
                            <span className="text-[10px] text-content-muted">
                              {project.dueDate ? `Due ${formatShortDate(project.dueDate)}` : 'No deadline'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${stateCfg.dotColor}`} />
                          <span className="text-[11px] text-content-muted">{stateCfg.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2.5 mt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-content-muted">
              <span>{recentProjects.length} total projects tracked</span>
              <Link
                to="/projects"
                className="text-content hover:text-primary font-medium transition-colors"
              >
                + New Project
              </Link>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

const emptyFocus = () => ({ active: 0, total: 0, dueToday: 0, upcoming: 0, overdue: 0, completed: 0 });
const taskHref = (projectId, taskId) => `/projects/${projectId}?tab=tasks&task=${taskId}`;
const formatShortDate = (value) => (value ? SHORT_DATE.format(calendarDate(value)) : '');
const calendarDayKey = (value) => calendarDate(value).toLocaleDateString('en-CA');
const calendarDate = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);

function nextSevenDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return { date, key: calendarDayKey(date), isToday: index === 0 };
  });
}

export default DashboardPage;
