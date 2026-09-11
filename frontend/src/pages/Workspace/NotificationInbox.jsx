import { useNavigate } from 'react-router-dom';
import { LuBell, LuCheck, LuMailOpen } from 'react-icons/lu';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/PageState';
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkNotificationUnreadMutation,
} from '../../services/collaborationApi';

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
    const projectId = notification.projectId || (
      notification.resourceType === 'PROJECT' ? notification.resourceId : null
    );
    if (projectId) navigate(`/projects/${projectId}`);
  };

  return (
    <DashboardLayout activeMenu="/inbox">
      <div className="my-6 max-w-4xl">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">Stay up to date with approvals, project activity, and workspace changes.</p>
        </header>
        {isLoading && <LoadingState message="Loading your inbox..." />}
        {isError && <ErrorState title="Unable to load notifications" message={error?.data?.message} onRetry={refetch} />}
        {!isLoading && !isError && notifications.length === 0 && (
          <EmptyState icon={LuBell} title="All caught up" description="There are no notifications in this workspace." />
        )}
        {!isLoading && !isError && notifications.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {notifications.map((notification) => {
              const unread = !notification.readAt;
              const hasProject = notification.projectId || (
                notification.resourceType === 'PROJECT' && notification.resourceId
              );
              const message = notification.safePayload?.message || notification.safePayload?.taskTitle || notification.safePayload?.projectName || notification.typeCode?.replace(/_/g, ' ') || 'Workspace update';
              return (
                <div key={notification.id} className={`flex gap-3 p-4 ${unread ? 'bg-blue-50/40' : 'bg-white'}`}>
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`} />
                  <button type="button" onClick={() => hasProject && openNotification(notification)} className={`min-w-0 flex-1 text-left ${hasProject ? 'cursor-pointer' : 'cursor-default'}`}>
                    <p className={`text-sm ${unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{message}</p>
                    <p className="mt-1 text-xs text-gray-500">{notification.typeCode?.replace(/_/g, ' ') || 'Notification'} · {new Date(notification.createdAt).toLocaleString()}</p>
                  </button>
                  <button type="button" onClick={() => toggleRead(notification)} aria-label={unread ? 'Mark notification as read' : 'Mark notification as unread'} className="shrink-0 rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
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
