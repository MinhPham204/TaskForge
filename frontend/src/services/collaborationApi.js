import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import axiosInstance from '../utils/axiosInstance.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const collaborationApi = createApi({
  reducerPath: 'collaborationApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['NotificationInbox', 'ProjectActivity', 'ProjectFile', 'TaskAttachment'],
  endpoints: (builder) => ({
    // ── Notifications ──────────────────────────────────────────────────────────
    getNotifications: builder.query({
      query: () => ({
        url: API_PATHS.NOTIFICATIONS.LIST,
        method: 'get',
      }),
      providesTags: ['NotificationInbox'],
    }),

    markNotificationRead: builder.mutation({
      query: (notificationId) => ({
        url: API_PATHS.NOTIFICATIONS.MARK_READ(notificationId),
        method: 'patch',
      }),
      invalidatesTags: ['NotificationInbox'],
    }),

    markNotificationUnread: builder.mutation({
      query: (notificationId) => ({
        url: API_PATHS.NOTIFICATIONS.MARK_UNREAD(notificationId),
        method: 'patch',
      }),
      invalidatesTags: ['NotificationInbox'],
    }),

    // ── Project Activities ─────────────────────────────────────────────────────
    getProjectActivities: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.ACTIVITIES(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectActivity', id: projectId },
      ],
    }),

    // ── Project Files ──────────────────────────────────────────────────────────
    getProjectFiles: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.FILES.LIST(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectFile', id: projectId },
      ],
    }),

    uploadProjectFile: builder.mutation({
      query: ({ projectId, formData }) => ({
        url: API_PATHS.PROJECTS.FILES.UPLOAD(projectId),
        method: 'post',
        data: formData,
        headers: {
          'Content-Type': undefined,
        },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectFile', id: projectId },
        { type: 'ProjectActivity', id: projectId },
      ],
    }),

    removeProjectFile: builder.mutation({
      query: ({ projectId, fileId }) => ({
        url: API_PATHS.PROJECTS.FILES.REMOVE(projectId, fileId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectFile', id: projectId },
        { type: 'ProjectActivity', id: projectId },
      ],
    }),

    // ── Task Attachments ───────────────────────────────────────────────────────
    getTaskAttachments: builder.query({
      query: ({ projectId, taskId }) => ({
        url: API_PATHS.PROJECTS.TASKS.ATTACHMENTS.LIST(projectId, taskId),
        method: 'get',
      }),
      providesTags: (result, error, { taskId }) => [
        { type: 'TaskAttachment', id: taskId },
      ],
    }),

    uploadTaskAttachment: builder.mutation({
      query: ({ projectId, taskId, formData }) => ({
        url: API_PATHS.PROJECTS.TASKS.ATTACHMENTS.UPLOAD(projectId, taskId),
        method: 'post',
        data: formData,
        headers: {
          'Content-Type': undefined,
        },
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'TaskAttachment', id: taskId },
        { type: 'ProjectActivity', id: projectId },
        { type: 'Task', id: taskId },
      ],
    }),

    unlinkTaskAttachment: builder.mutation({
      query: ({ projectId, taskId, attachmentId }) => ({
        url: API_PATHS.PROJECTS.TASKS.ATTACHMENTS.UNLINK(projectId, taskId, attachmentId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'TaskAttachment', id: taskId },
        { type: 'ProjectActivity', id: projectId },
        { type: 'Task', id: taskId },
      ],
    }),
  }),
});

export const downloadProjectFile = async (projectId, fileId, originalName = 'download') => {
  const response = await axiosInstance.get(
    API_PATHS.PROJECTS.FILES.DOWNLOAD(projectId, fileId),
    { responseType: 'blob' },
  );
  const blob = new Blob([response.data], {
    type: response.headers?.['content-type'] || 'application/octet-stream',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', originalName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const downloadTaskAttachment = async (
  projectId,
  taskId,
  attachmentId,
  originalName = 'download',
) => {
  const response = await axiosInstance.get(
    API_PATHS.PROJECTS.TASKS.ATTACHMENTS.DOWNLOAD(projectId, taskId, attachmentId),
    { responseType: 'blob' },
  );
  const blob = new Blob([response.data], {
    type: response.headers?.['content-type'] || 'application/octet-stream',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', originalName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkNotificationUnreadMutation,
  useGetProjectActivitiesQuery,
  useGetProjectFilesQuery,
  useUploadProjectFileMutation,
  useRemoveProjectFileMutation,
  useGetTaskAttachmentsQuery,
  useUploadTaskAttachmentMutation,
  useUnlinkTaskAttachmentMutation,
} = collaborationApi;
