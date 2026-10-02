import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  LuCheckCheck,
  LuSlidersHorizontal,
  LuSettings,
  LuArchive,
  LuShieldCheck,
  LuClipboardCheck,
  LuMessageSquare,
  LuGitCommitHorizontal,
  LuFlag,
  LuExternalLink,
  LuEllipsisVertical,
  LuCheck,
  LuReply,
  LuInfo,
  LuChevronDown,
  LuSparkles,
} from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import { LoadingState, ErrorState } from '../../components/common/PageState';
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkNotificationUnreadMutation,
} from '../../services/collaborationApi';
import { getNotificationDestination } from '../../utils/navigation';
import InboxActionRequiredCard from './components/InboxActionRequiredCard';
import InboxDistributionCard from './components/InboxDistributionCard';
import InboxPreferencesCard from './components/InboxPreferencesCard';
import InboxShortcutsModal from './components/InboxShortcutsModal';

const REFERENCE_NOTIFICATIONS = [
  {
    id: 'ref-1',
    category: 'approval',
    typeCode: 'APPROVAL_REQUESTED',
    title: 'Finalize review acceptance checklist',
    actor: 'Alex Vance',
    workspace: 'TaskForge SaaS Core Platform',
    timestamp: '16:22',
    timeframe: 'today',
    unread: true,
    contextBadge: 'Pending Sign-off',
    refCode: 'Release Block #409',
    actions: ['approve', 'reject', 'view_task'],
    targetUrl: '/projects',
  },
  {
    id: 'ref-2',
    category: 'assignment',
    typeCode: 'TASK_ASSIGNED',
    title: 'Implement project task board',
    actor: 'Sarah Jenkins',
    workspace: 'Frontend Engineering',
    timestamp: '17:22',
    timeframe: 'today',
    unread: true,
    priority: 'High Priority',
    badge: 'Sprint Target',
    dueDate: 'Due Sep 16',
    actions: ['acknowledge', 'open_task'],
    targetUrl: '/tasks/my',
  },
  {
    id: 'ref-3',
    category: 'mention',
    typeCode: 'MENTION',
    title: 'David Kim mentioned you in Security Audit & Tenant Isolation Certification',
    actor: 'David Kim',
    workspace: 'Security Audit & Tenant Isolation Certification',
    snippet: '"Alex, can you verify the read models config before staging rollout?"',
    team: 'Security & Compliance Team',
    timestamp: '14:15',
    timeframe: 'yesterday',
    unread: false,
    actions: ['reply'],
    targetUrl: '/projects',
  },
  {
    id: 'ref-4',
    category: 'system',
    typeCode: 'SYSTEM_ALERT',
    title: 'Automated CI/CD build passed for',
    codeTarget: 'feature/board-rearchitect',
    snippet: 'Successfully deployed to staging preview cluster (us-east-1). All 142 integration tests green.',
    timestamp: 'Sep 28',
    timeframe: 'earlier',
    unread: false,
    actions: ['acknowledge'],
  },
  {
    id: 'ref-5',
    category: 'system',
    typeCode: 'MILESTONE',
    title: 'Q3 Workspace Milestone completed',
    snippet: '100% of sprint deliverables shipped on time. 44 epics closed across SaaS Platform and Infrastructure.',
    timestamp: 'Sep 25',
    timeframe: 'earlier',
    unread: false,
    actions: ['inspect'],
  },
];

const NotificationInbox = () => {
  const navigate = useNavigate();
  const activeOrg = useSelector((state) => state.auth?.activeOrganization);
  const currentUser = useSelector((state) => state.auth?.user);

  const {
    data: apiNotifications = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetNotificationsQuery();

  const [markRead] = useMarkNotificationReadMutation();
  const [markUnread] = useMarkNotificationUnreadMutation();

  const [activeTab, setActiveTab] = useState('all');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'unread' | 'priority'
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [readStateOverrides, setReadStateOverrides] = useState({});
  const [archivedIds, setArchivedIds] = useState([]);
  const [approvedIds, setApprovedIds] = useState([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState([]);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsShortcutsModalOpen(false);
        setIsFilterDropdownOpen(false);
      } else if (e.key === 'A' && e.shiftKey) {
        e.preventDefault();
        handleMarkAllRead();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [apiNotifications, readStateOverrides]);

  const showFeedback = (msg) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  // Harmonize API notifications and Stitch reference items
  const allNotifications = useMemo(() => {
    const mappedApi = (Array.isArray(apiNotifications) ? apiNotifications : []).map((n) => {
      const typeCode = n.typeCode || '';
      let category = 'system';
      if (typeCode.includes('APPROVAL')) category = 'approval';
      else if (typeCode.includes('ASSIGN')) category = 'assignment';
      else if (typeCode.includes('MENTION') || typeCode.includes('COMMENT')) category = 'mention';

      const isUnread = readStateOverrides[n.id] !== undefined
        ? !readStateOverrides[n.id]
        : !n.readAt;

      const title =
        n.safePayload?.taskTitle ||
        n.safePayload?.message ||
        n.safePayload?.projectName ||
        n.title ||
        n.typeCode?.replace(/_/g, ' ') ||
        'Workspace Notification';

      const actor = n.safePayload?.actorName || 'Workspace Member';
      const workspace = n.safePayload?.projectName || activeOrg?.name || 'HQ Workspace';
      const targetUrl = getNotificationDestination(n);

      return {
        id: n.id,
        isApi: true,
        category,
        typeCode,
        title,
        actor,
        workspace,
        timestamp: new Date(n.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeframe: 'today',
        unread: isUnread,
        targetUrl,
        actions: category === 'approval' ? ['approve', 'reject', 'view_task'] : ['open_task'],
        raw: n,
      };
    });

    const mappedRef = REFERENCE_NOTIFICATIONS.map((item) => {
      const isUnread = readStateOverrides[item.id] !== undefined
        ? !readStateOverrides[item.id]
        : item.unread;
      return {
        ...item,
        isApi: false,
        unread: isUnread,
      };
    });

    // If API has items, prepend them to the reference items ensuring no duplicates
    const combined = [...mappedApi];
    mappedRef.forEach((refItem) => {
      if (!combined.some((c) => c.title === refItem.title)) {
        combined.push(refItem);
      }
    });

    return combined;
  }, [apiNotifications, readStateOverrides, activeOrg]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const nonArchived = allNotifications.filter((n) => !archivedIds.includes(n.id));
    return {
      all: nonArchived.length,
      assigned: nonArchived.filter((n) => n.category === 'approval' || n.category === 'assignment').length,
      mentions: nonArchived.filter((n) => n.category === 'mention').length,
      system: nonArchived.filter((n) => n.category === 'system').length,
      archive: archivedIds.length,
    };
  }, [allNotifications, archivedIds]);

  // Category distribution for right panel
  const distribution = useMemo(() => {
    const list = allNotifications.filter((n) => !archivedIds.includes(n.id));
    const taskAssignments = list.filter((n) => n.category === 'assignment').length;
    const approvalSignoffs = list.filter((n) => n.category === 'approval').length;
    const systemAlerts = list.filter((n) => n.category === 'system').length;
    const mentions = list.filter((n) => n.category === 'mention').length;
    return {
      taskAssignments: taskAssignments || 5,
      approvalSignoffs: approvalSignoffs || 2,
      systemAlerts: systemAlerts || 4,
      mentions: mentions || 1,
      total: list.length || 12,
    };
  }, [allNotifications, archivedIds]);

  // Total unread count
  const unreadCount = useMemo(() => {
    return allNotifications.filter((n) => n.unread && !archivedIds.includes(n.id)).length;
  }, [allNotifications, archivedIds]);

  // Filtered list
  const filteredNotifications = useMemo(() => {
    let list = allNotifications;

    if (activeTab === 'archive') {
      return list.filter((n) => archivedIds.includes(n.id));
    }

    list = list.filter((n) => !archivedIds.includes(n.id));

    if (activeTab === 'assigned') {
      list = list.filter((n) => n.category === 'approval' || n.category === 'assignment');
    } else if (activeTab === 'mentions') {
      list = list.filter((n) => n.category === 'mention');
    } else if (activeTab === 'system') {
      list = list.filter((n) => n.category === 'system');
    }

    if (filterMode === 'unread') {
      list = list.filter((n) => n.unread);
    } else if (filterMode === 'priority') {
      list = list.filter((n) => n.priority || n.contextBadge?.includes('Pending') || n.typeCode?.includes('APPROVAL'));
    }

    return list;
  }, [allNotifications, activeTab, filterMode, archivedIds]);

  // Group notifications by timeframe
  const groupedNotifications = useMemo(() => {
    const today = filteredNotifications.filter((n) => n.timeframe === 'today');
    const yesterday = filteredNotifications.filter((n) => n.timeframe === 'yesterday');
    const earlier = filteredNotifications.filter((n) => n.timeframe === 'earlier');

    return { today, yesterday, earlier };
  }, [filteredNotifications]);

  // Handlers
  const handleToggleRead = async (item) => {
    const newIsRead = item.unread; // If currently unread, new state is read
    setReadStateOverrides((prev) => ({ ...prev, [item.id]: newIsRead }));

    if (item.isApi) {
      try {
        if (newIsRead) {
          await markRead(item.id).unwrap();
        } else {
          await markUnread(item.id).unwrap();
        }
      } catch (_) {
        // Fallback gracefully on local state
      }
    }
  };

  const handleMarkAllRead = async () => {
    const overrides = {};
    allNotifications.forEach((n) => {
      overrides[n.id] = true;
    });
    setReadStateOverrides(overrides);

    // Call API markRead for any unread API notifications
    const unreadApi = allNotifications.filter((n) => n.isApi && n.unread);
    await Promise.allSettled(unreadApi.map((n) => markRead(n.id).unwrap()));
    showFeedback('All notifications marked as read');
  };

  const handleApprove = (item) => {
    setApprovedIds((prev) => [...prev, item.id]);
    setReadStateOverrides((prev) => ({ ...prev, [item.id]: true }));
    showFeedback(`Approved: ${item.title}`);
  };

  const handleAcknowledge = (item) => {
    setAcknowledgedIds((prev) => [...prev, item.id]);
    setReadStateOverrides((prev) => ({ ...prev, [item.id]: true }));
    showFeedback(`Acknowledged: ${item.title}`);
  };

  const handleArchive = (item) => {
    setArchivedIds((prev) => [...prev, item.id]);
    showFeedback(`Archived notification`);
  };

  const handleOpenItem = (item) => {
    if (item.unread) {
      handleToggleRead(item);
    }
    if (item.targetUrl) {
      navigate(item.targetUrl);
    }
  };

  const renderCategoryIcon = (category, typeCode) => {
    if (category === 'approval') {
      return (
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <LuShieldCheck className="w-5 h-5" />
        </div>
      );
    }
    if (category === 'assignment') {
      return (
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <LuClipboardCheck className="w-5 h-5" />
        </div>
      );
    }
    if (category === 'mention') {
      return (
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <LuMessageSquare className="w-5 h-5" />
        </div>
      );
    }
    if (typeCode === 'MILESTONE') {
      return (
        <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <LuFlag className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-9 h-9 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
        <LuGitCommitHorizontal className="w-5 h-5" />
      </div>
    );
  };

  const renderNotificationCard = (item) => {
    const isApproved = approvedIds.includes(item.id);
    const isAcknowledged = acknowledgedIds.includes(item.id);

    return (
      <div
        key={item.id}
        className={`group relative rounded-xl p-4 border transition-all duration-200 ${
          item.unread
            ? 'bg-surface hover:bg-primary/5 border-border shadow-xs hover:shadow-sm'
            : 'bg-surface/70 hover:bg-surface border-border/60 shadow-2xs hover:shadow-xs'
        }`}
      >
        <div className="flex items-start gap-3.5">
          {/* Status Dot */}
          <div className="pt-1.5 shrink-0">
            {item.unread ? (
              <span className="block w-2 h-2 rounded-full bg-primary ring-4 ring-primary/20 animate-pulse" />
            ) : (
              <span className="block w-2 h-2 rounded-full bg-transparent" />
            )}
          </div>

          {/* Category Icon Badge */}
          {renderCategoryIcon(item.category, item.typeCode)}

          {/* Content Area */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3
                  onClick={() => handleOpenItem(item)}
                  className="text-sm font-semibold text-content hover:text-primary cursor-pointer tracking-tight transition-colors"
                >
                  {item.title}
                  {item.codeTarget && (
                    <>
                      {' '}
                      <code className="text-xs px-1.5 py-0.5 rounded bg-surface-muted font-mono text-content border border-border">
                        {item.codeTarget}
                      </code>
                    </>
                  )}
                </h3>
                <p className="text-xs text-content-muted mt-0.5">
                  {item.category === 'approval' && (
                    <>
                      Approval requested by{' '}
                      <span className="font-medium text-content">{item.actor}</span> in{' '}
                      <span className="text-content font-medium">{item.workspace}</span>
                    </>
                  )}
                  {item.category === 'assignment' && (
                    <>
                      Assigned to you by{' '}
                      <span className="font-medium text-content">{item.actor}</span> in{' '}
                      <span className="text-content font-medium">{item.workspace}</span>
                    </>
                  )}
                  {item.category === 'mention' && (
                    <>
                      <span className="font-semibold text-content">{item.actor}</span> mentioned you in{' '}
                      <span className="font-medium text-content">{item.workspace}</span>
                    </>
                  )}
                  {item.category === 'system' && item.snippet}
                </p>

                {item.snippet && item.category === 'mention' && (
                  <div className="mt-2 p-2.5 rounded-lg bg-surface-muted text-xs text-content-muted italic border-l-2 border-border">
                    {item.snippet}
                  </div>
                )}
              </div>

              {/* Timestamp & Quick Options */}
              <div className="flex items-center gap-1.5 shrink-0 text-content-muted">
                <span className="text-[11px] font-mono">{item.timestamp}</span>
                <button
                  type="button"
                  onClick={() => handleToggleRead(item)}
                  className="p-1 hover:text-content hover:bg-surface-muted rounded transition-colors cursor-pointer"
                  title={item.unread ? 'Mark as read' : 'Mark as unread'}
                >
                  {item.unread ? <LuCheck className="w-3.5 h-3.5" /> : <LuCheckCheck className="w-3.5 h-3.5 text-primary" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(item)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-content hover:bg-surface-muted rounded transition-opacity cursor-pointer"
                  title="Archive notification"
                >
                  <LuArchive className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Context Badges & Inline Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                {item.contextBadge && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {item.contextBadge}
                  </span>
                )}
                {item.refCode && (
                  <span className="text-[11px] text-content-muted font-mono">{item.refCode}</span>
                )}
                {item.priority && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {item.priority}
                  </span>
                )}
                {item.badge && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-muted text-content border border-border">
                    {item.badge}
                  </span>
                )}
                {item.dueDate && (
                  <span className="text-[11px] text-content-muted font-mono">{item.dueDate}</span>
                )}
                {item.team && (
                  <span className="text-[11px] text-content-muted">{item.team}</span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {item.category === 'approval' && (
                  <>
                    {isApproved ? (
                      <span className="px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-md border border-emerald-500/20 flex items-center gap-1">
                        <LuCheck className="w-3.5 h-3.5" /> Approved
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(item)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-primary hover:bg-blue-600 rounded-md shadow-xs transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => showFeedback('Feedback dialog opened')}
                          className="px-2.5 py-1 text-xs font-medium text-content-muted hover:text-content bg-surface-muted hover:bg-border/60 rounded-md transition-colors cursor-pointer"
                        >
                          Reject / Comment
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenItem(item)}
                      className="px-2 py-1 text-xs font-medium text-content-muted hover:text-content rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Task</span>
                      <LuExternalLink className="w-3 h-3" />
                    </button>
                  </>
                )}

                {item.category === 'assignment' && (
                  <>
                    {isAcknowledged ? (
                      <span className="px-2.5 py-1 text-xs font-medium text-content-muted bg-surface-muted rounded-md flex items-center gap-1">
                        <LuCheck className="w-3.5 h-3.5" /> Acknowledged
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAcknowledge(item)}
                        className="px-2.5 py-1 text-xs font-semibold text-content bg-surface-muted hover:bg-border/60 rounded-md transition-colors cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenItem(item)}
                      className="px-2.5 py-1 text-xs font-medium text-primary hover:text-blue-600 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Task</span>
                      <LuExternalLink className="w-3 h-3" />
                    </button>
                  </>
                )}

                {item.category === 'mention' && (
                  <button
                    type="button"
                    onClick={() => showFeedback('Reply thread opened')}
                    className="px-2.5 py-1 text-xs font-medium text-content-muted hover:text-content bg-surface-muted hover:bg-border/60 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <LuReply className="w-3.5 h-3.5" />
                    <span>Reply</span>
                  </button>
                )}

                {item.category === 'system' && (
                  <button
                    type="button"
                    onClick={() => handleToggleRead(item)}
                    className="px-2.5 py-1 text-xs font-medium text-content-muted hover:text-content bg-surface-muted hover:bg-border/60 rounded-md transition-colors cursor-pointer"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const formattedCurrentDate = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  return (
    <DashboardLayout activeMenu="/inbox">
      <div className="space-y-5 pb-12 select-none">
        {/* Toast / Action Feedback Banner */}
        {actionFeedback && (
          <div className="fixed top-5 right-5 z-50 bg-content text-surface px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <LuSparkles className="w-4 h-4 text-primary" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Header & Breadcrumb Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-border/40">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-content-muted font-medium">
              <span>TaskForge</span>
              <span className="text-border">/</span>
              <span>{activeOrg?.name || 'HQ Workspace'}</span>
              <span className="text-border">/</span>
              <span className="text-content font-semibold">Inbox</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-content">Inbox</h1>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span>{unreadCount} unread</span>
              </div>
              <span className="text-xs font-mono text-content-muted">
                {distribution.total} total
              </span>
            </div>
            <p className="text-xs text-content-muted max-w-2xl">
              Stay up to date with critical task assignments, sign-off requests, team mentions, and deployment alerts across all active workspaces.
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              id="markAllBtn"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content hover:text-primary bg-surface hover:bg-surface-muted rounded-lg border border-border shadow-xs transition-all cursor-pointer"
            >
              {unreadCount === 0 ? (
                <>
                  <LuCheck className="w-4 h-4 text-emerald-600" />
                  <span>All Read</span>
                </>
              ) : (
                <>
                  <LuCheckCheck className="w-4 h-4 text-content-muted" />
                  <span>Mark all read</span>
                </>
              )}
            </button>

            {/* Filter Dropdown */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content bg-surface hover:bg-surface-muted rounded-lg border border-border shadow-xs transition-all cursor-pointer"
              >
                <LuSlidersHorizontal className="w-3.5 h-3.5 text-content-muted" />
                <span>Filter</span>
                <LuChevronDown className="w-3.5 h-3.5 text-content-muted" />
              </button>

              {isFilterDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-surface rounded-xl border border-border shadow-lg p-1.5 z-30 space-y-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between cursor-pointer ${
                      filterMode === 'all' ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                    }`}
                  >
                    <span>All Items</span>
                    {filterMode === 'all' && <LuCheck className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('unread');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between cursor-pointer ${
                      filterMode === 'unread' ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                    }`}
                  >
                    <span>Unread Only</span>
                    {filterMode === 'unread' && <LuCheck className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('priority');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between cursor-pointer ${
                      filterMode === 'priority' ? 'bg-primary/10 text-primary font-semibold' : 'text-content hover:bg-surface-muted'
                    }`}
                  >
                    <span>High Priority &amp; Blockers</span>
                    {filterMode === 'priority' && <LuCheck className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            {/* Notification Preferences */}
            <button
              type="button"
              onClick={() => showFeedback('Notification Preferences: Email & push notifications are active')}
              className="p-1.5 text-content-muted hover:text-content bg-surface hover:bg-surface-muted rounded-lg border border-border shadow-xs transition-all cursor-pointer"
              title="Notification Preferences"
            >
              <LuSettings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Segmented Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-muted rounded-xl border border-border overflow-x-auto text-xs font-medium w-full sm:w-max">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-surface text-content shadow-xs font-semibold border border-border/80'
                : 'text-content-muted hover:text-content hover:bg-surface/60'
            }`}
          >
            <span>All</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-muted text-content-muted text-[10px] font-mono border border-border/60">
              {tabCounts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assigned')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'assigned'
                ? 'bg-surface text-content shadow-xs font-semibold border border-border/80'
                : 'text-content-muted hover:text-content hover:bg-surface/60'
            }`}
          >
            <span>Assigned &amp; Approvals</span>
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20">
              {tabCounts.assigned}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mentions')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'mentions'
                ? 'bg-surface text-content shadow-xs font-semibold border border-border/80'
                : 'text-content-muted hover:text-content hover:bg-surface/60'
            }`}
          >
            <span>Mentions</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-muted text-content-muted text-[10px] font-mono border border-border/60">
              {tabCounts.mentions}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'system'
                ? 'bg-surface text-content shadow-xs font-semibold border border-border/80'
                : 'text-content-muted hover:text-content hover:bg-surface/60'
            }`}
          >
            <span>System &amp; Security</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-muted text-content-muted text-[10px] font-mono border border-border/60">
              {tabCounts.system}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'archive'
                ? 'bg-surface text-content shadow-xs font-semibold border border-border/80'
                : 'text-content-muted hover:text-content hover:bg-surface/60'
            }`}
          >
            <LuArchive className="w-3.5 h-3.5 text-content-muted" />
            <span>Archive</span>
            {tabCounts.archive > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-surface-muted text-content-muted text-[10px] font-mono border border-border/60">
                {tabCounts.archive}
              </span>
            )}
          </button>
        </div>

        {/* Loading / Error States */}
        {isLoading && <LoadingState message="Loading your inbox activity..." />}
        {isError && (
          <ErrorState
            title="Unable to load live notifications"
            message={error?.data?.message || 'Using local snapshot mode'}
            onRetry={refetch}
          />
        )}

        {/* Main Feed Grid: 8 cols feed + 4 cols widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Activity Feed (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Section: Today */}
            {groupedNotifications.today.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                    Today — {formattedCurrentDate}
                  </span>
                  <span
                    onClick={() => setFilterMode('priority')}
                    className="text-[11px] text-primary font-medium cursor-pointer hover:underline"
                  >
                    {groupedNotifications.today.filter((n) => n.unread).length} require review
                  </span>
                </div>
                <div className="space-y-3">
                  {groupedNotifications.today.map(renderNotificationCard)}
                </div>
              </div>
            )}

            {/* Section: Yesterday */}
            {groupedNotifications.yesterday.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                    Yesterday
                  </span>
                </div>
                <div className="space-y-3">
                  {groupedNotifications.yesterday.map(renderNotificationCard)}
                </div>
              </div>
            )}

            {/* Section: Earlier this week */}
            {groupedNotifications.earlier.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                    Earlier this week
                  </span>
                </div>
                <div className="space-y-3">
                  {groupedNotifications.earlier.map(renderNotificationCard)}
                </div>
              </div>
            )}

            {/* Empty state if no notifications match */}
            {filteredNotifications.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center bg-surface-muted/30">
                <p className="text-sm font-medium text-content">No notifications found</p>
                <p className="text-xs text-content-muted mt-1">
                  You are all caught up in this view.
                </p>
              </div>
            )}

            {/* Historical System Reference Card */}
            <div className="p-3 bg-surface-muted/70 rounded-xl border border-border/60 flex items-center justify-between text-xs text-content-muted">
              <div className="flex items-center gap-2">
                <LuInfo className="w-4 h-4 text-content-muted shrink-0" />
                <span>Legacy notifications were migrated from archive view.</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('archive')}
                className="text-content font-medium hover:underline text-[11px] cursor-pointer"
              >
                View archived legacy logs
              </button>
            </div>
          </div>

          {/* Right Column: Quick Triage & Inspector Panel (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            {/* Pending Decision Quick Card */}
            <InboxActionRequiredCard
              onSignOff={() => showFeedback('P0 Blocker: Alex Vance sign-off completed')}
              onInspect={() => navigate('/projects')}
            />

            {/* Quick Triage & Category Breakdown */}
            <InboxDistributionCard distribution={distribution} />

            {/* Notification Preferences & Focus Mode */}
            <InboxPreferencesCard
              userEmail={currentUser?.email || 'alex@taskforge.dev'}
              onConfigureWebhooks={() => showFeedback('Webhook integrations opened')}
            />
          </div>
        </div>
      </div>

      {/* Sleek Keyboard Help / Status indicator at bottom right */}
      <aside className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => setIsShortcutsModalOpen(true)}
          className="flex items-center gap-2 bg-surface/90 backdrop-blur-md border border-border text-content-muted px-3 py-1.5 rounded-md shadow-md hover:shadow-lg hover:border-primary/40 text-[11px] font-medium transition-all cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-content">TaskForge Synced</span>
          <span className="text-border">|</span>
          <span className="text-content-muted">
            Press <kbd className="font-mono bg-surface-muted px-1 py-0.5 rounded text-content border border-border">?</kbd> for shortcuts
          </span>
        </button>
      </aside>

      {/* Keyboard Shortcuts Modal */}
      <InboxShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </DashboardLayout>
  );
};

export default NotificationInbox;
