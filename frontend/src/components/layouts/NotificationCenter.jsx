import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuBell,
  LuCheck,
  LuCheckCheck,
  LuMail,
  LuMailOpen,
  LuRotateCcw,
  LuExternalLink,
  LuX,
  LuInfo,
  LuTriangleAlert,
} from 'react-icons/lu';
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkNotificationUnreadMutation,
} from '../../services/collaborationApi';

const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const {
    data: notifications = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetNotificationsQuery();

  const [markRead, { isLoading: isMarkingRead }] = useMarkNotificationReadMutation();
  const [markUnread, { isLoading: isMarkingUnread }] = useMarkNotificationUnreadMutation();

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggleRead = async (notification, e) => {
    e.stopPropagation();
    try {
      if (notification.readAt) {
        await markUnread(notification.id).unwrap();
      } else {
        await markRead(notification.id).unwrap();
      }
    } catch (_) {
      // Error handled by RTK Query
    }
  };

  const handleNavigate = (notification) => {
    if (notification.projectId) {
      setIsOpen(false);
      navigate(`/projects/${notification.projectId}`);
    } else if (notification.resourceType === 'PROJECT' && notification.resourceId) {
      setIsOpen(false);
      navigate(`/projects/${notification.resourceId}`);
    }
  };

  const formatNotificationMessage = (notification) => {
    const payload = notification.safePayload || {};
    if (payload.taskTitle) {
      return `Task: "${payload.taskTitle}"`;
    }
    if (payload.projectName) {
      return `Project: "${payload.projectName}"`;
    }
    if (payload.message && typeof payload.message === 'string') {
      return payload.message;
    }
    return notification.typeCode ? notification.typeCode.replace(/_/g, ' ') : 'Workspace update';
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <LuBell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-white bg-primary rounded-full ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Center"
          aria-modal="false"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[32rem]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/75">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close notifications panel"
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md cursor-pointer"
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-8 text-center space-y-2">
                <div className="inline-block w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Loading notifications...</p>
              </div>
            ) : isError ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 mx-auto rounded-full bg-red-50 text-red-600 flex items-center justify-center">
                  <LuTriangleAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-900">Failed to load notifications</p>
                  <p className="text-[11px] text-gray-500">
                    {error?.data?.message || 'Could not fetch your inbox at this time.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
                >
                  <LuRotateCcw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 mx-auto rounded-full bg-gray-50 text-gray-400 flex items-center justify-center">
                  <LuCheckCheck className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium text-gray-900">All caught up!</p>
                <p className="text-[11px] text-gray-500">
                  No notifications in this workspace.
                </p>
              </div>
            ) : (
              notifications.map((notification) => {
                const isUnread = !notification.readAt;
                const canNavigate = Boolean(
                  notification.projectId ||
                    (notification.resourceType === 'PROJECT' && notification.resourceId),
                );

                return (
                  <div
                    key={notification.id}
                    className={`p-3.5 transition-colors flex items-start gap-3 hover:bg-gray-50/80 ${
                      isUnread ? 'bg-blue-50/30' : 'bg-white'
                    }`}
                  >
                    {/* Unread indicator */}
                    <div className="pt-1.5 shrink-0">
                      <span
                        className={`block w-2 h-2 rounded-full ${
                          isUnread ? 'bg-primary' : 'bg-transparent'
                        }`}
                        title={isUnread ? 'Unread' : 'Read'}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-1.5 py-0.5 rounded bg-gray-100">
                          {notification.typeCode?.replace(/_/g, ' ') || 'Notification'}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {new Date(notification.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p
                        className={`text-xs leading-snug break-words ${
                          isUnread ? 'text-gray-900 font-medium' : 'text-gray-600'
                        }`}
                      >
                        {formatNotificationMessage(notification)}
                      </p>

                      {/* Action links */}
                      <div className="flex items-center gap-2 pt-1">
                        {canNavigate && (
                          <button
                            type="button"
                            onClick={() => handleNavigate(notification)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                          >
                            <span>View details</span>
                            <LuExternalLink className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleToggleRead(notification, e)}
                          disabled={isMarkingRead || isMarkingUnread}
                          className="text-[11px] text-gray-500 hover:text-gray-800 cursor-pointer inline-flex items-center gap-1 ml-auto disabled:opacity-50"
                        >
                          {isUnread ? (
                            <>
                              <LuCheck className="w-3 h-3 text-primary" />
                              <span>Mark read</span>
                            </>
                          ) : (
                            <>
                              <LuMail className="w-3 h-3" />
                              <span>Mark unread</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
