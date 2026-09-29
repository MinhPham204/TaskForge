import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import {
  useGetMyTasksQuery,
  useGetApprovalQueueQuery,
  useResolveApprovalMutation,
} from '../../services/taskApi';
import {
  TaskStatusBadge,
  PriorityBadge,
} from '../Projects/components/TaskStatusBadge';
import TaskDetailModal from '../Projects/components/TaskDetailModal';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/PageState';
import {
  LuClipboardCheck,
  LuShieldCheck,
  LuSearch,
  LuCalendar,
  LuUsers,
  LuCheck,
  LuX,
  LuFolderKanban,
} from 'react-icons/lu';

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const MyTasks = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isApprovalRoute = location.pathname.includes('approval-queue');
  const [activeTab, setActiveTab] = useState(isApprovalRoute ? 'approvals' : 'assigned'); // 'assigned' | 'approvals'

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
    } else if (tab === 'assigned' && location.pathname.includes('approval-queue')) {
      navigate('/tasks/my');
    }
  };
  const [search, setSearch] = useState('');
  const [priorityCode, setPriorityCode] = useState('');

  // Selected Task for Detail Modal
  const [selectedTaskContext, setSelectedTaskContext] = useState(null); // { projectId, taskId }

  // Quick Approval Modal State
  const [quickApprovalTarget, setQuickApprovalTarget] = useState(null); // { projectId, taskId, action: 'approve'|'reject', title }
  const [resolutionReason, setResolutionReason] = useState('');
  const [approvalError, setApprovalError] = useState('');

  const [resolveApproval, { isLoading: isResolving }] = useResolveApprovalMutation();

  const queryParams = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(priorityCode ? { priorityCode } : {}),
  };

  const {
    data: myTasks = [],
    isLoading: isTasksLoading,
    isError: isTasksError,
    error: tasksError,
    refetch: refetchTasks,
  } = useGetMyTasksQuery(queryParams);

  const {
    data: queue = [],
    isLoading: isQueueLoading,
    isError: isQueueError,
    error: queueError,
    refetch: refetchQueue,
  } = useGetApprovalQueueQuery();

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
      setQuickApprovalTarget(null);
      setResolutionReason('');
    } catch (err) {
      setApprovalError(err.data?.message || err.message || 'Approval action failed');
    }
  };

  return (
    <DashboardLayout activeMenu={activeTab === 'approvals' ? '/tasks/approval-queue' : '/tasks/my'}>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">Task Center</h1>
            <p className="mt-1 text-xs text-content-muted sm:text-sm">
              Track tasks assigned to you across projects and manage your pending approvals.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-border">
          <button
            type="button"
            onClick={() => handleTabChange('assigned')}
            className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'assigned'
                ? 'border-primary text-primary'
                : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            <LuClipboardCheck className="w-4 h-4" />
            My Assigned Tasks
            <span
              className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                activeTab === 'assigned'
                  ? 'bg-primary text-white'
                  : 'bg-surface-muted text-content-muted border border-border'
              }`}
            >
              {myTasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('approvals')}
            className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'approvals'
                ? 'border-primary text-primary'
                : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            <LuShieldCheck className="w-4 h-4" />
            Approval Queue
            {queue.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-white animate-pulse">
                {queue.length}
              </span>
            )}
          </button>
        </div>

        {/* Assigned Tasks Tab */}
        {activeTab === 'assigned' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-border shadow-xs">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <LuSearch className="absolute left-3 top-2.5 w-4 h-4 text-content-muted" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search assigned tasks..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface border border-border text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-content-muted/60"
                  />
                </div>

                <select
                  value={priorityCode}
                  onChange={(e) => setPriorityCode(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-content focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isTasksLoading ? (
              <LoadingState message="Loading your tasks..." />
            ) : isTasksError ? (
              <ErrorState
                title="Failed to load tasks"
                message={tasksError?.data?.message || 'Could not load your assigned tasks.'}
                onRetry={refetchTasks}
              />
            ) : myTasks.length === 0 ? (
              <EmptyState
                icon={LuClipboardCheck}
                title="No assigned tasks"
                description="You currently have no tasks assigned to you across visible projects."
              />
            ) : (
              <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted border-b border-border text-content-muted font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Task</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Priority</th>
                        <th className="py-3 px-4">Team</th>
                        <th className="py-3 px-4">Progress</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {myTasks.map((task) => (
                        <tr
                          key={task.id}
                          onClick={() =>
                            setSelectedTaskContext({
                              projectId: task.projectId,
                              taskId: task.id,
                            })
                          }
                          className="hover:bg-surface-muted/60 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4 max-w-xs">
                            <span className="font-semibold text-content block truncate">
                              {task.title}
                            </span>
                            {task.description && (
                              <span className="text-[11px] text-content-muted block truncate mt-0.5">
                                {task.description}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <TaskStatusBadge
                              category={task.semanticCategory}
                              label={task.statusName}
                            />
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <PriorityBadge priority={task.priorityCode} />
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                            {task.owningTeamName}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2 w-24">
                              <div className="flex-1 bg-surface-muted rounded-full h-1.5 overflow-hidden border border-border/50">
                                <div
                                  className="bg-primary h-full rounded-full"
                                  style={{ width: `${task.effectiveProgress || 0}%` }}
                                />
                              </div>
                              <span className="font-medium text-content-muted text-[11px]">
                                {task.effectiveProgress || 0}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                            {task.dueAt ? (
                              <span className="inline-flex items-center gap-1">
                                <LuCalendar className="w-3.5 h-3.5 text-content-muted/70" />
                                {new Date(task.dueAt).toLocaleDateString()}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskContext({
                                  projectId: task.projectId,
                                  taskId: task.id,
                                });
                              }}
                              className="text-primary hover:text-primary/80 font-medium cursor-pointer"
                            >
                              Open Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Approval Queue Tab */}
        {activeTab === 'approvals' && (
          <div className="space-y-4">
            {isQueueLoading ? (
              <LoadingState message="Loading approval queue..." />
            ) : isQueueError ? (
              <ErrorState
                title="Failed to load queue"
                message={queueError?.data?.message || 'Could not load your approval queue.'}
                onRetry={refetchQueue}
              />
            ) : queue.length === 0 ? (
              <EmptyState
                icon={LuShieldCheck}
                title="No pending approvals"
                description="You do not have any pending tasks waiting for your approval."
              />
            ) : (
              <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted border-b border-border text-content-muted font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Task</th>
                        <th className="py-3 px-4">Priority</th>
                        <th className="py-3 px-4">Cycle</th>
                        <th className="py-3 px-4">Request Reason</th>
                        <th className="py-3 px-4">Requested At</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {queue.map((req) => (
                        <tr
                          key={req.id}
                          onClick={() =>
                            setSelectedTaskContext({
                              projectId: req.projectId,
                              taskId: req.taskId,
                            })
                          }
                          className="hover:bg-surface-muted/60 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4 max-w-xs">
                            <span className="font-semibold text-content block truncate">
                              {req.title}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <PriorityBadge priority={req.priorityCode} />
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-medium text-content-muted">
                            #{req.requestNumber}
                          </td>
                          <td className="py-3 px-4 text-content-muted max-w-sm truncate">
                            {req.requestReason || '—'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-content-muted">
                            {new Date(req.requestedAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right space-x-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuickApprovalTarget({
                                  projectId: req.projectId,
                                  taskId: req.taskId,
                                  action: 'approve',
                                  title: req.title,
                                });
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuickApprovalTarget({
                                  projectId: req.projectId,
                                  taskId: req.taskId,
                                  action: 'reject',
                                  title: req.title,
                                });
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-rose-600 rounded hover:bg-rose-700 cursor-pointer"
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTaskContext && (
        <TaskDetailModal
          isOpen={Boolean(selectedTaskContext)}
          onClose={() => setSelectedTaskContext(null)}
          projectId={selectedTaskContext.projectId}
          taskId={selectedTaskContext.taskId}
          canManage={false}
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
            className="w-full p-2.5 text-xs bg-surface text-content border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-content-muted/60"
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
    </DashboardLayout>
  );
};

export default MyTasks;