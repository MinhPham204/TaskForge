import { useNavigate } from 'react-router-dom';
import { LuBell, LuCheck, LuMailOpen } from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/PageState';
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkNotificationUnreadMutation,
} from '../../services/collaborationApi';
import { getNotificationDestination } from '../../utils/navigation.js';

const NotificationInbox = () => {
  const navigate = useNavigate();
  const { data: notifications = [], isLoading, isError, error, refetch } = useGetNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markUnread] = useMarkNotificationUnreadMutation();

  const toggleRead = async (notification) => {
    if (notification.readAt) await markUnread(notification.id).unwrap();
    else await markRead(notification.id).unwrap();
  };

  const openNotification = async (notification) => {
    if (!notification.readAt) await markRead(notification.id).unwrap();
    const destination = getNotificationDestination(notification);
    if (destination) navigate(destination);
  };

  return (
    <DashboardLayout activeMenu="/inbox">
      <div className="space-y-6 max-w-4xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-content sm:text-3xl">Inbox</h1>
          <p className="mt-1 text-xs text-content-muted sm:text-sm">Stay up to date with approvals, project activity, and workspace changes.</p>
        </header>
        {isLoading && <LoadingState message="Loading your inbox..." />}
        {isError && <ErrorState title="Unable to load notifications" message={error?.data?.message} onRetry={refetch} />}
        {!isLoading && !isError && notifications.length === 0 && (
          <EmptyState icon={LuBell} title="All caught up" description="There are no notifications in this workspace." />
        )}
        {!isLoading && !isError && notifications.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border shadow-xs">
            {notifications.map((notification) => {
              const unread = !notification.readAt;
              const destination = getNotificationDestination(notification);
              const canNavigate = Boolean(destination);
              const message = notification.safePayload?.message || notification.safePayload?.taskTitle || notification.safePayload?.projectName || notification.typeCode?.replace(/_/g, ' ') || 'Workspace update';
              return (
                <div key={notification.id} className={`flex gap-3 p-4 transition-colors ${unread ? 'bg-primary/5' : 'bg-surface hover:bg-surface-muted/50'}`}>
                  <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`} />
                  <button type="button" onClick={() => canNavigate && openNotification(notification)} className={`min-w-0 flex-1 text-left ${canNavigate ? 'cursor-pointer' : 'cursor-default'}`}>
                    <p className={`text-sm ${unread ? 'font-semibold text-content' : 'text-content-muted'}`}>{message}</p>
                    <p className="mt-1 text-xs text-content-muted/80">{notification.typeCode?.replace(/_/g, ' ') || 'Notification'} · {new Date(notification.createdAt).toLocaleString()}</p>
                  </button>
                  <button type="button" onClick={() => toggleRead(notification)} aria-label={unread ? 'Mark notification as read' : 'Mark notification as unread'} className="shrink-0 rounded-md p-2 text-content-muted hover:bg-surface-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
                    {unread ? <LuCheck className="h-4 w-4" /> : <LuMailOpen className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default NotificationInbox;
