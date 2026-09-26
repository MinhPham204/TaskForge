import React, { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  LuArrowRight,
  LuCalendarDays,
  LuCircleAlert,
  LuClipboardCheck,
  LuClock3,
  LuListTodo,
  LuShieldCheck,
  LuSparkles,
  LuFolderKanban,
  LuCircleCheck,
  LuActivity,
  LuCircle,
  LuChartColumn,
  LuChartPie,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/PageState.jsx';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { useGetDashboardQuery } from '../../services/dashboardApi.js';
import { CustomBarchart, CustomPieChart } from '../../components/Charts/index.js';
import { DashboardSchedule } from './components/DashboardSchedule.jsx';

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const PRIORITY_BADGE = {
  URGENT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  LOW: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800',
};

const PROJECT_STATE_BADGE = {
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  DRAFT: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800',
};

const DashboardPage = () => {
  const {
    user,
    activeOrganization,
    activeOrganizationId,
    organizationsInitialized,
  } = useUserAuth();

  const workspacePending = !organizationsInitialized;
  const noActiveWorkspace = organizationsInitialized && !activeOrganizationId;

  const { data, isLoading, isError, error, refetch } = useGetDashboardQuery(undefined, {
    skip: workspacePending || noActiveWorkspace,
  });

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

  const priorityChartData = useMemo(() => {
    const counts = {
      Urgent: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };

    const tasks = data?.assignedTasks || [];
    const focusData = data?.focus;

    if (tasks.length > 0) {
      for (const t of tasks) {
        const p = String(t.priorityCode || '').toUpperCase();
        if (p === 'URGENT') counts.Urgent++;
        else if (p === 'HIGH') counts.High++;
        else if (p === 'MEDIUM') counts.Medium++;
        else counts.Low++;
      }
    } else if (focusData && focusData.total > 0) {
      counts.Urgent = focusData.overdue || 0;
      counts.High = focusData.dueToday || 0;
      counts.Medium = focusData.upcoming || 0;
      counts.Low = Math.max(0, focusData.total - counts.Urgent - counts.High - counts.Medium);
    }

    return [
      { priority: 'Urgent', count: counts.Urgent },
      { priority: 'High', count: counts.High },
      { priority: 'Medium', count: counts.Medium },
      { priority: 'Low', count: counts.Low },
    ];
  }, [data?.assignedTasks, data?.focus]);

  const statusChartData = useMemo(() => {
    const tasks = data?.assignedTasks || [];
    const focusData = data?.focus;

    if (tasks.length > 0) {
      const counts = {
        'In Progress': 0,
        'In Review': 0,
        'Done': 0,
        'To Do': 0,
      };

      for (const t of tasks) {
        const cat = String(t.semanticCategory || '').toUpperCase();
        if (cat === 'IN_PROGRESS') counts['In Progress']++;
        else if (cat === 'IN_REVIEW') counts['In Review']++;
        else if (cat === 'COMPLETED') counts['Done']++;
        else counts['To Do']++;
      }

      return [
        { status: 'In Progress', count: counts['In Progress'], color: '#3B82F6' },
        { status: 'In Review', count: counts['In Review'], color: '#8B5CF6' },
        { status: 'Done', count: counts['Done'], color: '#10B981' },
        { status: 'To Do', count: counts['To Do'], color: '#94A3B8' },
      ];
    }

    return [
      { status: 'In Progress', count: focusData?.active || 0, color: '#3B82F6' },
      { status: 'Completed', count: focusData?.completed || 0, color: '#10B981' },
      { status: 'Overdue', count: focusData?.overdue || 0, color: '#EF4444' },
      { status: 'Upcoming', count: focusData?.upcoming || 0, color: '#8B5CF6' },
    ];
  }, [data?.assignedTasks, data?.focus]);

  const completionPercentage = useMemo(() => {
    const total = data?.focus?.total || 0;
    if (total === 0) return 0;
    return Math.round(((data?.focus?.completed || 0) / total) * 100);
  }, [data?.focus?.completed, data?.focus?.total]);

  const urgentAndHighCount = useMemo(() => {
    return (priorityChartData[0]?.count || 0) + (priorityChartData[1]?.count || 0);
  }, [priorityChartData]);

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
    return <Navigate to="/workspace/onboarding" replace />;
  }

  if (isError) {
    return (
      <DashboardLayout activeMenu="/dashboard">
        <div className="mx-auto my-6 max-w-7xl">
          <ErrorState
            title="Unable to load your dashboard"
            message={error?.data?.message || 'Your workspace data could not be loaded. Try again in a moment.'}
            onRetry={refetch}
          />
        </div>
      </DashboardLayout>
    );
  }

  const focus = data?.focus || emptyFocus();
  const assignedTasks = data?.assignedTasks || [];
  const pendingApprovals = data?.pendingApprovals || [];
  const recentProjects = data?.recentProjects || [];
  const calendarItems = data?.calendarItems || [];

  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  return (
    <DashboardLayout activeMenu="/dashboard">
      <div className="mx-auto my-5 max-w-7xl space-y-6">
        {/* Dynamic Context Greeting & Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-border">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
              <LuSparkles className="w-3.5 h-3.5" />
              <span>{activeOrganization?.name || 'Workspace'} · {todayLabel}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-content sm:text-3xl">
              Welcome back, {firstName(user?.name)}
            </h1>
            <p className="mt-1 text-sm text-content-muted">
              Here is your daily snapshot of active assignments, deadlines, and approvals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/tasks/my"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow cursor-pointer"
            >
              <LuListTodo className="h-4 w-4" aria-hidden="true" />
              <span>My Tasks</span>
            </Link>
          </div>
        </header>

        {/* Focus Metrics (Enhanced Stat Cards) */}
        <section aria-label="Work focus metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FocusCard
            icon={LuClipboardCheck}
            label="Active Assignments"
            value={focus.active}
            subtext={`${focus.total} assigned in total`}
            to="/tasks/my"
            tone="blue"
            trend={focus.active > 0 ? `${focus.active} in progress` : 'No active work'}
          />

          <FocusCard
            icon={LuClock3}
            label="Due Today"
            value={focus.dueToday}
            subtext={`${focus.upcoming} upcoming this week`}
            to="/tasks/my"
            tone="amber"
            highlight={focus.dueToday > 0}
          />

          <FocusCard
            icon={LuCircleAlert}
            label="Overdue Tasks"
            value={focus.overdue}
            subtext={focus.overdue > 0 ? 'Requires immediate action' : 'All deadlines on track'}
            to="/tasks/my"
            tone={focus.overdue > 0 ? 'rose' : 'emerald'}
            highlight={focus.overdue > 0}
          />

          <FocusCard
            icon={LuShieldCheck}
            label="Approval Requests"
            value={pendingApprovals.length}
            subtext="Awaiting your decision"
            to="/tasks/approval-queue"
            tone={pendingApprovals.length > 0 ? 'purple' : 'neutral'}
            highlight={pendingApprovals.length > 0}
          />
        </section>

        {/* Visual Analytics & Task Distribution Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Task Priority Distribution (CustomBarchart) */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs flex flex-col justify-between transition-all hover:border-border/80">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
                    <LuChartColumn className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-content">
                      Tasks by Priority
                    </h2>
                    <p className="text-xs text-content-muted">Urgency breakdown across assigned work</p>
                  </div>
                </div>
                {urgentAndHighCount > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                    {urgentAndHighCount} Urgent / High
                  </span>
                )}
              </div>
              <div className="mt-4">
                <CustomBarchart data={priorityChartData} height={280} />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-content-muted">
              <span>Urgent · High · Medium · Low</span>
              <span className="font-mono">{priorityChartData.reduce((acc, d) => acc + d.count, 0)} Tasks Tracked</span>
            </div>
          </div>

          {/* Card 2: Task Status Distribution (CustomPieChart) */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs flex flex-col justify-between transition-all hover:border-border/80">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <LuChartPie className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-content">
                      Task Status Breakdown
                    </h2>
                    <p className="text-xs text-content-muted">Progression across workflow stages</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                  {completionPercentage}% Complete
                </span>
              </div>
              <div className="mt-4">
                <CustomPieChart data={statusChartData} height={280} />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-content-muted">
              <span>Hover slice for details</span>
              <span className="font-medium text-content">{focus.total} Total Tasks</span>
            </div>
          </div>
        </section>

        {/* 7-Day Schedule & Approval Queue Section */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
          {/* Interactive 7-Day Schedule with Grid & Agenda views */}
          <DashboardSchedule
            week={week}
            calendarItemsByDay={calendarItemsByDay}
            totalItemsCount={calendarItems.length}
          />

          {/* Approval Queue Panel */}
          <section
            className="rounded-xl border border-border bg-surface p-5 shadow-sm flex flex-col justify-between"
            aria-labelledby="approval-heading"
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
                    <LuShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 id="approval-heading" className="text-base font-semibold text-content">
                      Approval Queue
                    </h2>
                    <p className="text-xs text-content-muted">Decisions assigned to you</p>
                  </div>
                </div>
                <Link
                  to="/tasks/approval-queue"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View all
                </Link>
              </div>

              {pendingApprovals.length === 0 ? (
                <div className="my-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 mx-auto flex items-center justify-center">
                    <LuCircleCheck className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-content">No pending approvals</p>
                  <p className="text-xs text-content-muted">
                    You have reviewed and cleared all task completion requests.
                  </p>
                </div>
              ) : (
                <div className="mt-3 divide-y divide-border/60">
                  {pendingApprovals.slice(0, 4).map((approval) => (
                    <Link
                      key={approval.id}
                      to={taskHref(approval.projectId, approval.taskId)}
                      className="block py-3 hover:bg-surface-muted/50 rounded-lg px-2 -mx-2 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">
                          Review Needed
                        </span>
                        <span className="text-[11px] text-content-muted">
                          {formatDate(approval.requestedAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs font-semibold text-content group-hover:text-primary mt-1">
                        {approval.title}
                      </p>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-content-muted">
                        <span className="truncate">{approval.projectName}</span>
                        <span className="inline-flex items-center gap-1 text-primary font-medium">
                          Review <LuArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {pendingApprovals.length > 0 && (
              <div className="pt-3 border-t border-border/60">
                <Link
                  to="/tasks/approval-queue"
                  className="w-full py-2 px-3 rounded-lg bg-surface-muted hover:bg-primary hover:text-white text-xs font-semibold text-content transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Open Full Approval Queue</span>
                  <LuArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </section>
        </section>

        {/* Assigned Tasks & Recent Projects Row */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Assigned Work with Progress Bars */}
          <section
            className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4"
            aria-labelledby="assigned-heading"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-primary flex items-center justify-center">
                  <LuClipboardCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="assigned-heading" className="text-base font-semibold text-content">
                    Assigned to You
                  </h2>
                  <p className="text-xs text-content-muted">Your active priorities and progress</p>
                </div>
              </div>
              <Link
                to="/tasks/my"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>All tasks</span>
                <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {assignedTasks.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title="No assigned tasks"
                  description="Tasks assigned to you in visible projects will show up here."
                />
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {assignedTasks.slice(0, 5).map((task) => {
                  const priorityClass =
                    PRIORITY_BADGE[task.priorityCode] ||
                    'bg-surface-muted text-content-muted border-border';
                  const progress = Math.min(100, Math.max(0, task.effectiveProgress || 0));

                  return (
                    <Link
                      key={task.id}
                      to={taskHref(task.projectId, task.id)}
                      className="block py-3 hover:bg-surface-muted/50 rounded-lg px-2 -mx-2 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${priorityClass}`}
                            >
                              {task.priorityCode || 'TASK'}
                            </span>
                            <span className="text-xs font-semibold text-content group-hover:text-primary truncate">
                              {task.title}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-content-muted truncate">
                            {task.projectName} · <span className="font-medium">{task.statusName}</span>
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="text-[11px] font-medium text-content-muted block">
                            {task.dueAt ? formatDate(task.dueAt) : 'No due date'}
                          </span>
                          <span className="text-[10px] text-primary font-semibold">
                            {progress}%
                          </span>
                        </div>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="mt-2 h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                        <div
                          style={{ width: `${progress}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            progress === 100
                              ? 'bg-emerald-500'
                              : progress > 50
                              ? 'bg-blue-500'
                              : 'bg-primary/70'
                          }`}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent Projects with Badges & Metadata */}
          <section
            className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4"
            aria-labelledby="recent-heading"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
                  <LuFolderKanban className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="recent-heading" className="text-base font-semibold text-content">
                    Recent Projects
                  </h2>
                  <p className="text-xs text-content-muted">Accessible workspaces & boards</p>
                </div>
              </div>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>All projects</span>
                <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {recentProjects.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title="No visible projects"
                  description="Projects you join or create will be listed here."
                />
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recentProjects.map((project) => {
                  const stateBadge =
                    PROJECT_STATE_BADGE[project.state] ||
                    'bg-surface-muted text-content-muted border-border';

                  return (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-surface-muted/50 rounded-lg px-2 -mx-2 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-surface-muted border border-border flex items-center justify-center shrink-0 font-bold text-xs text-primary group-hover:border-primary transition-colors">
                          {project.name?.charAt(0)?.toUpperCase() || 'P'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-content group-hover:text-primary truncate">
                            {project.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded border ${stateBadge}`}
                            >
                              {project.state}
                            </span>
                            <span className="text-[10px] text-content-muted truncate">
                              {project.dueDate ? `Due ${formatDate(project.dueDate)}` : 'No deadline'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <LuArrowRight className="w-4 h-4 text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </div>
    </DashboardLayout>
  );
};

/**
 * Modern Focus Metric Card
 */
const FocusCard = ({
  icon: Icon,
  label,
  value,
  subtext,
  to,
  tone = 'blue',
  highlight = false,
  trend,
}) => {
  const toneStyles = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'hover:border-blue-300 dark:hover:border-blue-800',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'hover:border-amber-300 dark:hover:border-amber-800',
    },
    rose: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-600 dark:text-rose-400',
      border: 'hover:border-rose-300 dark:hover:border-rose-800',
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'hover:border-purple-300 dark:hover:border-purple-800',
    },
    neutral: {
      bg: 'bg-surface-muted',
      text: 'text-content-muted',
      border: 'hover:border-border',
    },
  };

  const style = toneStyles[tone] || toneStyles.blue;

  return (
    <Link
      to={to}
      className={`rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer block ${
        style.border
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${style.bg} ${style.text}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
        {highlight && (
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        )}
      </div>

      <div className="mt-3">
        <p className="text-2xl sm:text-3xl font-bold tracking-tight text-content">{value}</p>
        <p className="text-xs font-semibold text-content mt-0.5">{label}</p>
        <p className="text-[11px] text-content-muted mt-1 truncate">{subtext}</p>
      </div>
    </Link>
  );
};

const emptyFocus = () => ({ active: 0, total: 0, dueToday: 0, upcoming: 0, overdue: 0, completed: 0 });
const firstName = (name) => String(name || 'there').trim().split(/\s+/)[0] || 'there';
const taskHref = (projectId, taskId) => `/projects/${projectId}?tab=tasks&task=${taskId}`;
const formatDate = (value) => (value ? DATE_FORMAT.format(calendarDate(value)) : 'No date');
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
