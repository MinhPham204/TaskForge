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
import useUserAuth from '../../hooks/useUserAuth.jsx';
import { getNotificationDestination } from '../../utils/navigation.js';

const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { activeOrganizationId } = useUserAuth();

  const {
    data: notifications = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetNotificationsQuery(undefined, { skip: !activeOrganizationId });

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
    const destination = getNotificationDestination(notification);
    if (destination) {
      setIsOpen(false);
      navigate(destination);
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
        title="Notifications"
        className="relative p-1.5 text-content-muted hover:text-content rounded-md hover:bg-surface-muted transition-colors cursor-pointer focus:outline-none"
      >
        <LuBell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-surface" />
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Center"
          aria-modal="false"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface border border-border text-content rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[32rem]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-muted/60">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-content">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close notifications panel"
              className="text-content-muted hover:text-content hover:bg-surface-muted p-1 rounded-md transition-colors cursor-pointer"
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {isLoading ? (
              <div className="p-8 text-center space-y-2">
                <div className="inline-block w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-content-muted">Loading notifications...</p>
              </div>
            ) : isError ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 mx-auto rounded-full bg-danger-surface text-danger-content flex items-center justify-center">
                  <LuTriangleAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-content">Failed to load notifications</p>
                  <p className="text-[11px] text-content-muted">
                    {error?.data?.message || 'Could not fetch your inbox at this time.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 cursor-pointer"
                >
                  <LuRotateCcw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 mx-auto rounded-full bg-surface-muted text-content-muted flex items-center justify-center">
                  <LuCheckCheck className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium text-content">All caught up!</p>
                <p className="text-[11px] text-content-muted">
                  No notifications in this workspace.
                </p>
              </div>
            ) : (
              notifications.map((notification) => {
                const isUnread = !notification.readAt;
                const destination = getNotificationDestination(notification);
                const canNavigate = Boolean(destination);

                return (
                  <div
                    key={notification.id}
                    className={`p-3.5 transition-colors flex items-start gap-3 hover:bg-surface-muted/60 ${
                      isUnread ? 'bg-primary/5' : 'bg-surface'
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
                        <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-content-muted px-1.5 py-0.5 rounded bg-surface-muted border border-border/50">
                          {notification.typeCode?.replace(/_/g, ' ') || 'Notification'}
                        </span>
                        <span className="text-[10px] text-content-muted/80 shrink-0">
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
                          isUnread ? 'text-content font-medium' : 'text-content-muted'
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
                          className="text-[11px] text-content-muted hover:text-content cursor-pointer inline-flex items-center gap-1 ml-auto disabled:opacity-50"
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
