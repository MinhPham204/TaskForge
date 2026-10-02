import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import {
  useGetMyTasksQuery,
  useGetApprovalQueueQuery,
  useResolveApprovalMutation,
} from '../../services/taskApi';
import { useGetProjectsQuery } from '../../services/projectApi';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import PriorityBars, { LinearStatusIcon } from '../../components/task/PriorityBars.jsx';
import { isTaskOverdue } from '../../utils/taskAttention.js';
import TaskDetailModal from '../Projects/components/TaskDetailModal';
import TaskFormModal from '../Projects/components/TaskFormModal';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import MyTaskInspector from './components/MyTaskInspector.jsx';
import MyTaskBoardView from './components/MyTaskBoardView.jsx';
import workflowBannerImg from '../../assets/images/modern_clean_minimalist.png';
import {
  LuSearch,
  LuList,
  LuKanban,
  LuPlus,
  LuCalendar,
  LuShieldCheck,
  LuCheck,
  LuExternalLink,
  LuLayers,
  LuCheckCheck,
  LuSparkles,
  LuChevronRight,
} from 'react-icons/lu';

const MyTasks = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, activeOrganizationId } = useUserAuth();

  const isApprovalRoute = location.pathname.includes('approval-queue');
  const [activeTab, setActiveTab] = useState(isApprovalRoute ? 'approvals' : 'assigned');
  // 'assigned' | 'created' | 'subscribed' | 'approvals'

  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState('dueDate'); // 'dueDate' | 'priority' | 'status' | 'title'

  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskContext, setSelectedTaskContext] = useState(null); // { projectId, taskId }

  // Quick Approval Modal State
  const [quickApprovalTarget, setQuickApprovalTarget] = useState(null); // { projectId, taskId, action: 'approve'|'reject', title }
  const [resolutionReason, setResolutionReason] = useState('');
  const [approvalError, setApprovalError] = useState('');

  // Create Task Modal State
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);

  const searchInputRef = useRef(null);

  useEffect(() => {
    if (location.pathname.includes('approval-queue')) {
      setActiveTab('approvals');
    } else {
      setActiveTab('assigned');
    }
  }, [location.pathname]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'approvals' && !location.pathname.includes('approval-queue')) {
      navigate('/tasks/approval-queue');
    } else if (tab !== 'approvals' && location.pathname.includes('approval-queue')) {
      navigate('/tasks/my');
    }
  };

  // Queries
  const queryParams = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(priorityFilter ? { priorityCode: priorityFilter } : {}),
  };

  const {
    data: rawMyTasks = [],
    isLoading: isTasksLoading,
    isError: isTasksError,
    error: tasksError,
    refetch: refetchTasks,
  } = useGetMyTasksQuery(queryParams, { skip: !activeOrganizationId });

  const {
    data: queue = [],
    isLoading: isQueueLoading,
    isError: isQueueError,
    error: queueError,
    refetch: refetchQueue,
  } = useGetApprovalQueueQuery(undefined, { skip: !activeOrganizationId });

  const { data: projects = [] } = useGetProjectsQuery(undefined, {
    skip: !activeOrganizationId,
  });
  const firstProjectId = projects[0]?.id;

  const [resolveApproval, { isLoading: isResolving }] = useResolveApprovalMutation();

  // Filter tasks based on Perspective Tab
  const perspectiveTasks = useMemo(() => {
    if (activeTab === 'approvals') return [];
    if (activeTab === 'created') {
      return rawMyTasks.filter((t) => t.creatorUserId === user?.id || t.creatorProjectMembershipId);
    }
    if (activeTab === 'subscribed') {
      return rawMyTasks.filter((t) => t.isSubscribed || t.isParticipant);
    }
    // 'assigned' (Default)
    return rawMyTasks;
  }, [rawMyTasks, activeTab, user?.id]);

  // Apply Status & Sort
  const filteredAndSortedTasks = useMemo(() => {
    let result = [...perspectiveTasks];

    // Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter(
        (t) => String(t.semanticCategory || '').toUpperCase() === statusFilter
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'dueDate') {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }
      if (sortBy === 'priority') {
        const order = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return (order[b.priorityCode] || 0) - (order[a.priorityCode] || 0);
      }
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'status') {
        return (a.semanticCategory || '').localeCompare(b.semanticCategory || '');
      }
      return 0;
    });

    return result;
  }, [perspectiveTasks, statusFilter, sortBy]);

  // Grouped task slices for Linear-style list
  const inProgressTasks = useMemo(
    () =>
      filteredAndSortedTasks.filter(
        (t) => String(t.semanticCategory || '').toUpperCase() === 'IN_PROGRESS'
      ),
    [filteredAndSortedTasks]
  );

  const todoTasks = useMemo(
    () =>
      filteredAndSortedTasks.filter((t) => {
        const cat = String(t.semanticCategory || '').toUpperCase();
        return cat === 'NOT_STARTED' || cat === 'REVIEW' || cat === 'IN_REVIEW';
      }),
    [filteredAndSortedTasks]
  );

  const completedTasks = useMemo(
    () =>
      filteredAndSortedTasks.filter((t) => {
        const cat = String(t.semanticCategory || '').toUpperCase();
        return cat === 'COMPLETED' || cat === 'CANCELLED';
      }),
    [filteredAndSortedTasks]
  );

  // Set default selected task
  useEffect(() => {
    if (filteredAndSortedTasks.length > 0 && !selectedTask) {
      setSelectedTask(filteredAndSortedTasks[0]);
    } else if (
      selectedTask &&
      !filteredAndSortedTasks.some((t) => t.id === selectedTask.id)
    ) {
      setSelectedTask(filteredAndSortedTasks[0] || null);
    }
  }, [filteredAndSortedTasks, selectedTask]);

  // Keyboard shortcut listener: '/' for search, 'c' for new task, 'Space' for inspect
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((e.key === 'c' || e.key === 'C') && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleCreateNewTask();
        return;
      }

      if (e.key === ' ' && !isInput && filteredAndSortedTasks.length > 0) {
        e.preventDefault();
        const currentIndex = filteredAndSortedTasks.findIndex(
          (t) => t.id === selectedTask?.id
        );
        const nextIndex = (currentIndex + 1) % filteredAndSortedTasks.length;
        setSelectedTask(filteredAndSortedTasks[nextIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredAndSortedTasks, selectedTask, firstProjectId]);

  const handleCreateNewTask = () => {
    if (!projects || projects.length === 0) {
      toast.error('Please create or join a project first before creating tasks.');
      navigate('/projects');
      return;
    }
    setIsTaskFormOpen(true);
  };

  const handleQuickResolve = async () => {
    if (!quickApprovalTarget) return;
    setApprovalError('');
    try {
      await resolveApproval({
        projectId: quickApprovalTarget.projectId,
        taskId: quickApprovalTarget.taskId,
        action: quickApprovalTarget.action,
        reason: resolutionReason.trim() || undefined,
      }).unwrap();
      toast.success(
        `Task ${quickApprovalTarget.action === 'approve' ? 'approved' : 'rejected'} successfully`
      );
      setQuickApprovalTarget(null);
      setResolutionReason('');
    } catch (err) {
      setApprovalError(err.data?.message || err.message || 'Approval action failed');
    }
  };

  const formatDueDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'created':
        return 'Created by me';
      case 'subscribed':
        return 'Subscribed';
      case 'approvals':
        return 'Approval Queue';
      default:
        return 'Assigned to me';
    }
  };

  const activeCount =
    activeTab === 'approvals'
      ? queue.length
      : inProgressTasks.length + todoTasks.length;

  return (
    <DashboardLayout
      activeMenu={activeTab === 'approvals' ? '/tasks/approval-queue' : '/tasks/my'}
    >
      <div className="space-y-5 pb-12 select-none">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-content-muted mb-1">
              <Link to="/dashboard" className="hover:text-content transition-colors">
                TaskForge
              </Link>
              <span>/</span>
              <span>Workspace</span>
              <span>/</span>
              <span className="text-content font-medium">My Tasks</span>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-content">
                {getTabTitle()}
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-surface-muted text-content border border-border">
                {activeCount} active
              </span>
            </div>
            <p className="text-xs text-content-muted mt-1">
              Track tasks assigned to you across projects, inspect deliverables, and unblock approvals.
            </p>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            {/* Filter Search */}
            <div className="relative">
              <LuSearch className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter tasks (press /)..."
                className="w-44 lg:w-60 pl-8 pr-7 py-1.5 text-xs bg-surface text-content border border-border rounded-md placeholder:text-content-muted focus:outline-none focus:border-primary transition-all shadow-2xs"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-content-muted bg-surface-muted border border-border px-1 py-0.2 rounded">
                /
              </kbd>
            </div>

            {/* List / Board Switcher */}
            {activeTab !== 'approvals' && (
              <div className="flex items-center bg-surface-muted p-0.5 rounded-md border border-border text-content-muted">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-surface text-content shadow-2xs font-semibold'
                      : 'text-content-muted hover:text-content'
                  }`}
                  title="List view"
                >
                  <LuList className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  className={`px-2 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'board'
                      ? 'bg-surface text-content shadow-2xs font-semibold'
                      : 'text-content-muted hover:text-content'
                  }`}
                  title="Board view"
                >
                  <LuKanban className="w-3.5 h-3.5" />
                  <span>Board</span>
                </button>
              </div>
            )}

            {/* New Task Button */}
            <button
              type="button"
              onClick={handleCreateNewTask}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-medium px-3 py-1.5 rounded-md shadow-2xs transition-colors cursor-pointer"
            >
              <LuPlus className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>New Task</span>
              <kbd className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono ml-0.5">C</kbd>
            </button>
          </div>
        </div>

        {/* Perspective Tabs & Facet Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-b border-border pb-3">
          {/* View Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-medium scrollbar-none">
            <button
              type="button"
              onClick={() => handleTabChange('assigned')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'assigned'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold'
                  : 'text-content-muted hover:text-content hover:bg-surface-muted'
              }`}
            >
              <span>Assigned to me</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'assigned'
                    ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                    : 'bg-surface-muted text-content-muted'
                }`}
              >
                {rawMyTasks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('created')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'created'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold'
                  : 'text-content-muted hover:text-content hover:bg-surface-muted'
              }`}
            >
              <span>Created by me</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'created'
                    ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                    : 'bg-surface-muted text-content-muted'
                }`}
              >
                {rawMyTasks.filter((t) => t.creatorUserId === user?.id).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('subscribed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'subscribed'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold'
                  : 'text-content-muted hover:text-content hover:bg-surface-muted'
              }`}
            >
              <span>Subscribed</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'subscribed'
                    ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                    : 'bg-surface-muted text-content-muted'
                }`}
              >
                {rawMyTasks.filter((t) => t.isSubscribed).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('approvals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'approvals'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold'
                  : 'text-content-muted hover:text-content hover:bg-surface-muted'
              }`}
            >
              <span>Approval Queue</span>
              {queue.length > 0 ? (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              ) : null}
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'approvals'
                    ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                    : 'bg-surface-muted text-content-muted'
                }`}
              >
                {queue.length}
              </span>
            </button>
          </div>

          {/* Quick Facet Filters */}
          {activeTab !== 'approvals' && (
            <div className="flex items-center gap-2 text-xs">
              {/* Status Filter */}
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-surface text-content border border-border px-2 py-1 rounded-md text-xs shadow-2xs focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="ALL">Status: All</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="NOT_STARTED">To Do</option>
                <option value="REVIEW">In Review</option>
                <option value="COMPLETED">Completed</option>
              </select>

              {/* Priority Filter */}
              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-surface text-content border border-border px-2 py-1 rounded-md text-xs shadow-2xs focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="">Priority: All</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {/* Sort By */}
              <select
                aria-label="Sort tasks by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-surface text-content border border-border px-2 py-1 rounded-md text-xs shadow-2xs focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="dueDate">Sort: Due Date</option>
                <option value="priority">Sort: Priority</option>
                <option value="title">Sort: Title</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>
          )}
        </div>

        {/* Main Bento Split: 8 cols List / Board vs 4 cols Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANEL: 8 cols */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            {activeTab === 'approvals' ? (
              // ─── Approval Queue Content ──────────────────────────────────────────
              isQueueLoading ? (
                <LoadingState message="Loading approval requests..." />
              ) : isQueueError ? (
                <ErrorState message="Failed to load approvals" onRetry={refetchQueue} />
              ) : queue.length === 0 ? (
                <EmptyState
                  icon={LuShieldCheck}
                  title="All approvals cleared"
                  description="You have no pending task approval requests in this workspace."
                />
              ) : (
                <div className="space-y-3">
                  {queue.map((req) => (
                    <div
                      key={`queue-${req.id}`}
                      className="bg-surface rounded-xl border border-border p-4 shadow-2xs hover:border-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-content-muted font-semibold">
                            #{req.requestNumber}
                          </span>
                          <span className="text-content-muted">·</span>
                          <span className="text-content-muted bg-surface-muted border border-border px-2 py-0.5 rounded text-[10px]">
                            {req.projectName || 'Project'}
                          </span>
                          <PriorityBars priority={req.priorityCode} />
                        </div>

                        <h3 className="text-sm font-semibold text-content leading-snug line-clamp-2">
                          {req.title}
                        </h3>

                        {req.requestReason && (
                          <p className="text-xs text-content-muted bg-surface-muted/60 p-2 rounded-lg border border-border/50 italic line-clamp-2">
                            "{req.requestReason}"
                          </p>
                        )}

                        <div className="text-[11px] text-content-muted">
                          Requested by <span className="font-medium text-content">{req.requesterName || 'Team member'}</span> on {new Date(req.requestedAt).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTaskContext({
                              projectId: req.projectId,
                              taskId: req.taskId,
                            })
                          }
                          className="px-2.5 py-1.5 text-xs text-content-muted hover:text-content hover:bg-surface-muted border border-border rounded-md transition-colors cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setQuickApprovalTarget({
                              projectId: req.projectId,
                              taskId: req.taskId,
                              action: 'reject',
                              title: req.title,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors cursor-pointer shadow-2xs"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setQuickApprovalTarget({
                              projectId: req.projectId,
                              taskId: req.taskId,
                              action: 'approve',
                              title: req.title,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer shadow-2xs"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : viewMode === 'board' ? (
              // ─── Board Mode ──────────────────────────────────────────────────────
              <MyTaskBoardView
                tasks={filteredAndSortedTasks}
                onSelectTask={setSelectedTask}
                selectedTaskId={selectedTask?.id}
              />
            ) : (
              // ─── List Mode (Linear Grouped Task List) ────────────────────────────
              isTasksLoading ? (
                <LoadingState message="Loading tasks..." />
              ) : isTasksError ? (
                <ErrorState message="Failed to load tasks" onRetry={refetchTasks} />
              ) : filteredAndSortedTasks.length === 0 ? (
                <EmptyState
                  icon={LuLayers}
                  title="No tasks match your filters"
                  description="Try adjusting your search criteria or switch to another perspective tab."
                />
              ) : (
                <div className="space-y-4">
                  {/* Group 1: IN PROGRESS */}
                  {inProgressTasks.length > 0 && (
                    <div className="bg-surface rounded-xl border border-border shadow-2xs overflow-hidden">
                      <div className="bg-surface-muted/60 px-4 py-2.5 flex items-center justify-between border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-content">
                            In Progress
                          </span>
                          <span className="text-xs font-mono text-content-muted">
                            {inProgressTasks.length}
                          </span>
                        </div>
                        <span className="text-[11px] text-content-muted">Active Sprint</span>
                      </div>

                      <div className="divide-y divide-border/60">
                        {inProgressTasks.map((task) => {
                          const isSelected = selectedTask?.id === task.id;
                          const taskCode = task.taskNumber
                            ? `TF-${task.taskNumber}`
                            : `TF-${task.id?.slice(-3).toUpperCase()}`;
                          const isOverdue = isTaskOverdue(task.dueAt, task.semanticCategory);
                          const progress = task.effectiveProgress ?? task.manualProgress ?? 0;

                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              onDoubleClick={() =>
                                setSelectedTaskContext({
                                  projectId: task.projectId,
                                  taskId: task.id,
                                })
                              }
                              className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-surface-muted/80 ring-1 ring-inset ring-primary/40'
                                  : 'hover:bg-surface-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <span className="text-blue-500">
                                  <LinearStatusIcon category="IN_PROGRESS" />
                                </span>
                                <span className="font-mono text-xs text-content-muted group-hover:text-content transition-colors shrink-0">
                                  {taskCode}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-content group-hover:text-primary transition-colors truncate">
                                      {task.title}
                                    </span>
                                    {task.requiresApproval && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 shrink-0">
                                        Approval Required
                                      </span>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className="text-[11px] text-content-muted truncate mt-0.5">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3.5 shrink-0 text-xs pl-2">
                                {task.projectName && (
                                  <span className="hidden sm:inline-flex px-2 py-0.5 text-[11px] bg-surface-muted text-content-muted rounded border border-border/50 truncate max-w-[120px]">
                                    {task.projectName}
                                  </span>
                                )}

                                <PriorityBars priority={task.priorityCode} />

                                <div className="hidden md:flex items-center gap-1.5 w-16" title={`${progress}% completed`}>
                                  <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border/50">
                                    <div
                                      className="bg-blue-500 h-1.5 rounded-full"
                                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-mono text-content-muted">
                                    {progress}%
                                  </span>
                                </div>

                                {task.dueAt && (
                                  <div
                                    className={`flex items-center gap-1 text-[11px] ${
                                      isOverdue
                                        ? 'text-rose-600 dark:text-rose-400 font-medium'
                                        : 'text-content-muted'
                                    }`}
                                  >
                                    <LuCalendar className="w-3 h-3" />
                                    <span>{formatDueDate(task.dueAt)}</span>
                                  </div>
                                )}

                                <div className="w-5 h-5 rounded-full bg-zinc-800 text-white text-[9px] font-semibold flex items-center justify-center">
                                  {task.assigneeName ? task.assigneeName.slice(0, 2).toUpperCase() : 'U'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Group 2: TO DO & BACKLOG */}
                  {todoTasks.length > 0 && (
                    <div className="bg-surface rounded-xl border border-border shadow-2xs overflow-hidden">
                      <div className="bg-surface-muted/60 px-4 py-2.5 flex items-center justify-between border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-zinc-400" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-content">
                            To Do &amp; Backlog
                          </span>
                          <span className="text-xs font-mono text-content-muted">
                            {todoTasks.length}
                          </span>
                        </div>
                        <span className="text-[11px] text-content-muted">Next Up</span>
                      </div>

                      <div className="divide-y divide-border/60">
                        {todoTasks.map((task) => {
                          const isSelected = selectedTask?.id === task.id;
                          const taskCode = task.taskNumber
                            ? `TF-${task.taskNumber}`
                            : `TF-${task.id?.slice(-3).toUpperCase()}`;
                          const isOverdue = isTaskOverdue(task.dueAt, task.semanticCategory);
                          const progress = task.effectiveProgress ?? task.manualProgress ?? 0;

                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              onDoubleClick={() =>
                                setSelectedTaskContext({
                                  projectId: task.projectId,
                                  taskId: task.id,
                                })
                              }
                              className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-surface-muted/80 ring-1 ring-inset ring-primary/40'
                                  : 'hover:bg-surface-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <span className="text-content-muted">
                                  <LinearStatusIcon category="NOT_STARTED" />
                                </span>
                                <span className="font-mono text-xs text-content-muted group-hover:text-content transition-colors shrink-0">
                                  {taskCode}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-content group-hover:text-primary transition-colors truncate">
                                      {task.title}
                                    </span>
                                    {task.requiresApproval && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 shrink-0">
                                        Approval Required
                                      </span>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className="text-[11px] text-content-muted truncate mt-0.5">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3.5 shrink-0 text-xs pl-2">
                                {task.projectName && (
                                  <span className="hidden sm:inline-flex px-2 py-0.5 text-[11px] bg-surface-muted text-content-muted rounded border border-border/50 truncate max-w-[120px]">
                                    {task.projectName}
                                  </span>
                                )}

                                <PriorityBars priority={task.priorityCode} />

                                <div className="hidden md:flex items-center gap-1.5 w-16" title={`${progress}% completed`}>
                                  <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border/50">
                                    <div
                                      className="bg-amber-500 h-1.5 rounded-full"
                                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-mono text-content-muted">
                                    {progress}%
                                  </span>
                                </div>

                                {task.dueAt && (
                                  <div
                                    className={`flex items-center gap-1 text-[11px] ${
                                      isOverdue
                                        ? 'text-rose-600 dark:text-rose-400 font-medium'
                                        : 'text-content-muted'
                                    }`}
                                  >
                                    <LuCalendar className="w-3 h-3" />
                                    <span>{formatDueDate(task.dueAt)}</span>
                                  </div>
                                )}

                                <div className="w-5 h-5 rounded-full bg-zinc-800 text-white text-[9px] font-semibold flex items-center justify-center">
                                  {task.assigneeName ? task.assigneeName.slice(0, 2).toUpperCase() : 'U'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Group 3: COMPLETED */}
                  {completedTasks.length > 0 && (
                    <div className="bg-surface rounded-xl border border-border shadow-2xs overflow-hidden opacity-85 hover:opacity-100 transition-opacity">
                      <div className="bg-surface-muted/60 px-4 py-2.5 flex items-center justify-between border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-content">
                            Completed
                          </span>
                          <span className="text-xs font-mono text-content-muted">
                            {completedTasks.length}
                          </span>
                        </div>
                        <span className="text-[11px] text-content-muted">Archived / Finished</span>
                      </div>

                      <div className="divide-y divide-border/60">
                        {completedTasks.map((task) => {
                          const isSelected = selectedTask?.id === task.id;
                          const taskCode = task.taskNumber
                            ? `TF-${task.taskNumber}`
                            : `TF-${task.id?.slice(-3).toUpperCase()}`;

                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              onDoubleClick={() =>
                                setSelectedTaskContext({
                                  projectId: task.projectId,
                                  taskId: task.id,
                                })
                              }
                              className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-surface-muted/80 ring-1 ring-inset ring-primary/40'
                                  : 'hover:bg-surface-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <span className="text-emerald-500">
                                  <LinearStatusIcon category="COMPLETED" />
                                </span>
                                <span className="font-mono text-xs text-content-muted line-through shrink-0">
                                  {taskCode}
                                </span>
                                <div className="min-w-0">
                                  <span className="text-xs font-medium text-content-muted line-through truncate block">
                                    {task.title}
                                  </span>
                                  {task.description && (
                                    <p className="text-[11px] text-content-muted/80 truncate mt-0.5">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3.5 shrink-0 text-xs pl-2">
                                {task.projectName && (
                                  <span className="hidden sm:inline-flex px-2 py-0.5 text-[11px] bg-surface-muted text-content-muted rounded border border-border/50 truncate max-w-[120px]">
                                    {task.projectName}
                                  </span>
                                )}

                                <span className="text-[11px] text-content-muted">Done</span>

                                <div className="hidden md:flex items-center gap-1.5 w-16" title="100% completed">
                                  <div className="w-full bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border/50">
                                    <div className="bg-emerald-500 h-1.5 rounded-full w-full" />
                                  </div>
                                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                                    100%
                                  </span>
                                </div>

                                {task.dueAt && (
                                  <div className="flex items-center gap-1 text-[11px] text-content-muted">
                                    <LuCalendar className="w-3 h-3" />
                                    <span>{formatDueDate(task.dueAt)}</span>
                                  </div>
                                )}

                                <div className="w-5 h-5 rounded-full bg-surface-muted text-content-muted text-[9px] font-semibold flex items-center justify-center border border-border">
                                  {task.assigneeName ? task.assigneeName.slice(0, 2).toUpperCase() : 'U'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Collaborative Workflow Showcase Card */}
            <div className="bg-surface rounded-xl border border-border shadow-2xs overflow-hidden">
              <div className="p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 mb-2 border border-blue-200/60 dark:border-blue-900">
                      <LuSparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span className="uppercase tracking-wider font-semibold">Collaborative Workflow</span>
                    </div>
                    <h3 className="text-base font-semibold text-content tracking-tight">Effortless collaboration across all teams</h3>
                    <p className="text-xs text-content-muted mt-0.5 leading-relaxed">Coordinate cross-functional projects, align timelines, and deliver milestone results seamlessly.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => navigate('/projects')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content hover:text-content bg-surface-muted hover:bg-surface-muted/80 border border-border rounded-md transition-colors shadow-2xs cursor-pointer"
                    >
                      <span>Explore Hub</span>
                      <LuChevronRight className="w-3 h-3 text-content-muted" />
                    </button>
                  </div>
                </div>

                {/* Showcase Image Banner */}
                <div className="relative rounded-lg overflow-hidden border border-border group bg-surface-muted h-64 sm:h-72 w-full">
                  <img
                    src={workflowBannerImg}
                    alt="Modern, clean, minimalist abstract geometric 3D banner graphic for effortless workflow"
                    className="w-full h-full object-cover object-center group-hover:scale-[1.01] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Cross-functional Metrics Strip */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-4 mt-1 border-t border-border">
                  <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-muted border border-border/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-content truncate">Cross-team Alignment</div>
                      <div className="text-[10px] text-content-muted font-mono">98% on-track</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-muted border border-border/60">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-content truncate">Shared Resources</div>
                      <div className="text-[10px] text-content-muted font-mono">{projects.length || 12} active workspaces</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-muted border border-border/60">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-content truncate">Milestones</div>
                      <div className="text-[10px] text-content-muted font-mono">4 delivered this sprint</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Status & Footnote */}
            <div className="flex items-center justify-between px-2 pt-2 text-xs text-content-muted border-t border-border/50">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Synced with Git repository · Branch: <code className="font-mono text-content">feature/board-rearchitect</code></span>
              </div>
              <span className="text-[11px]">
                Press <kbd className="px-1.5 py-0.5 bg-surface-muted border border-border rounded font-mono text-[10px] text-content">Space</kbd> to inspect
              </span>
            </div>
          </div>

          {/* RIGHT PANEL: 4 cols Inspector */}
          <div className="lg:col-span-4">
            <MyTaskInspector
              task={selectedTask}
              onOpenFullModal={(t) =>
                setSelectedTaskContext({
                  projectId: t.projectId,
                  taskId: t.id,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Full Task Detail Modal */}
      {selectedTaskContext && (
        <TaskDetailModal
          isOpen={Boolean(selectedTaskContext)}
          onClose={() => setSelectedTaskContext(null)}
          projectId={selectedTaskContext.projectId}
          taskId={selectedTaskContext.taskId}
          canManage={false}
        />
      )}

      {/* Create Task Modal */}
      {isTaskFormOpen && (
        <TaskFormModal
          isOpen={isTaskFormOpen}
          onClose={() => setIsTaskFormOpen(false)}
          projectId={firstProjectId}
          projects={projects}
          canManage={true}
          onSuccess={() => {
            refetchTasks();
            refetchQueue();
          }}
        />
      )}

      {/* Quick Approval Modal */}
      <Modal
        isOpen={Boolean(quickApprovalTarget)}
        onClose={() => setQuickApprovalTarget(null)}
        title={
          quickApprovalTarget?.action === 'approve'
            ? `Approve Task: ${quickApprovalTarget?.title}`
            : `Reject Task: ${quickApprovalTarget?.title}`
        }
      >
        <div className="space-y-4">
          {approvalError && (
            <div className="p-2.5 text-xs text-danger-content bg-danger-surface border border-danger-border rounded-lg">
              {approvalError}
            </div>
          )}

          <p className="text-xs text-content-muted">
            {quickApprovalTarget?.action === 'approve'
              ? 'Provide an optional reason for approving this request:'
              : 'Provide an optional reason for rejecting this request:'}
          </p>

          <textarea
            rows={3}
            value={resolutionReason}
            onChange={(e) => setResolutionReason(e.target.value)}
            placeholder="Resolution reason (optional)..."
            className="w-full p-2.5 text-xs bg-surface text-content border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-content-muted"
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setQuickApprovalTarget(null)}
              className="px-4 py-2 text-xs font-medium text-content-muted bg-surface border border-border rounded-lg hover:bg-surface-muted cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleQuickResolve}
              disabled={isResolving}
              className={`px-4 py-2 text-xs font-medium text-white rounded-lg cursor-pointer disabled:opacity-50 ${
                quickApprovalTarget?.action === 'reject'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isResolving ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Floating Status Indicator at bottom right */}
      <aside className="fixed bottom-4 right-4 z-30">
        <div className="flex items-center gap-2 bg-surface/90 backdrop-blur-md border border-border text-content px-3 py-1.5 rounded-md shadow-lg text-[11px] font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>TaskForge Synced</span>
          <span className="text-border">|</span>
          <span className="text-content-muted">
            Press <kbd className="font-mono bg-surface-muted border border-border px-1 py-0.5 rounded text-content text-[10px]">?</kbd> for shortcuts
          </span>
        </div>
      </aside>
    </DashboardLayout>
  );
};

export default MyTasks;