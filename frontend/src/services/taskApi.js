import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import axiosInstance from '../utils/axiosInstance.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const taskApi = createApi({
  reducerPath: 'taskApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Task',
    'ProjectTaskList',
    'ProjectTaskBoard',
    'ProjectTaskOverview',
    'ProjectTaskReport',
    'MyTasks',
    'ApprovalQueue',
  ],
  endpoints: (builder) => ({
    // ─── PostgreSQL Project Tasks Queries ─────────────────────────────────────
    getProjectTasks: builder.query({
      query: ({ projectId, ...params }) => ({
        url: API_PATHS.PROJECTS.TASKS.LIST(projectId),
        method: 'get',
        params,
      }),
      providesTags: (result, error, { projectId }) => [
        { type: 'ProjectTaskList', id: projectId },
      ],
    }),

    getProjectTaskBoard: builder.query({
      query: ({ projectId, ...params }) => ({
        url: API_PATHS.PROJECTS.TASKS.BOARD(projectId),
        method: 'get',
        params,
      }),
      providesTags: (result, error, { projectId }) => [
        { type: 'ProjectTaskBoard', id: projectId },
      ],
    }),

    getProjectTaskDetail: builder.query({
      query: ({ projectId, taskId }) => ({
        url: API_PATHS.PROJECTS.TASKS.GET_BY_ID(projectId, taskId),
        method: 'get',
      }),
      providesTags: (result, error, { taskId }) => [{ type: 'Task', id: taskId }],
    }),

    getProjectTaskOverview: builder.query({
      query: ({ projectId, ...params }) => ({
        url: API_PATHS.PROJECTS.TASKS.OVERVIEW(projectId),
        method: 'get',
        params,
      }),
      providesTags: (result, error, { projectId }) => [
        { type: 'ProjectTaskOverview', id: projectId },
      ],
    }),

    getProjectTaskReport: builder.query({
      query: ({ projectId, ...params }) => ({
        url: API_PATHS.PROJECTS.TASKS.REPORT(projectId),
        method: 'get',
        params,
      }),
      providesTags: (result, error, { projectId }) => [
        { type: 'ProjectTaskReport', id: projectId },
      ],
    }),

    // ─── PostgreSQL Workspace Read Endpoints ─────────────────────────────────
    getMyTasks: builder.query({
      query: (params) => ({
        url: API_PATHS.TASKS.MY,
        method: 'get',
        params,
      }),
      providesTags: ['MyTasks'],
    }),

    getApprovalQueue: builder.query({
      query: () => ({
        url: API_PATHS.TASKS.APPROVAL_QUEUE,
        method: 'get',
      }),
      providesTags: ['ApprovalQueue'],
    }),

    // ─── PostgreSQL Task Mutations ───────────────────────────────────────────
    createProjectTask: builder.mutation({
      query: ({ projectId, ...data }) => ({
        url: API_PATHS.PROJECTS.TASKS.CREATE(projectId),
        method: 'post',
        data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        { type: 'ProjectTaskOverview', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
      ],
    }),

    updateProjectTask: builder.mutation({
      query: ({ projectId, taskId, ...data }) => ({
        url: API_PATHS.PROJECTS.TASKS.UPDATE(projectId, taskId),
        method: 'patch',
        data,
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        { type: 'ProjectTaskOverview', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
      ],
    }),

    archiveProjectTask: builder.mutation({
      query: ({ projectId, taskId }) => ({
        url: API_PATHS.PROJECTS.TASKS.ARCHIVE(projectId, taskId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        { type: 'ProjectTaskOverview', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
        'ApprovalQueue',
      ],
    }),

    transitionTaskStatus: builder.mutation({
      query: ({ projectId, taskId, statusId }) => ({
        url: API_PATHS.PROJECTS.TASKS.STATUS(projectId, taskId),
        method: 'patch',
        data: { statusId },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskOverview', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
      ],
    }),

    setTaskManualProgress: builder.mutation({
      query: ({ projectId, taskId, manualProgress }) => ({
        url: API_PATHS.PROJECTS.TASKS.MANUAL_PROGRESS(projectId, taskId),
        method: 'patch',
        data: { manualProgress },
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        { type: 'ProjectTaskOverview', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
      ],
    }),

    addChecklistItem: builder.mutation({
      query: ({ projectId, taskId, text }) => ({
        url: API_PATHS.PROJECTS.TASKS.CHECKLIST_ITEMS(projectId, taskId),
        method: 'post',
        data: { text },
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        { type: 'ProjectTaskOverview', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
      ],
    }),

    setChecklistItemCompletion: builder.mutation({
      query: ({ projectId, taskId, itemId, completed }) => ({
        url: API_PATHS.PROJECTS.TASKS.CHECKLIST_ITEM(projectId, taskId, itemId),
        method: 'patch',
        data: { completed },
      }),
      async onQueryStarted({ projectId, taskId, itemId, completed }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          taskApi.util.updateQueryData(
            'getProjectTaskDetail',
            { projectId, taskId },
            (draft) => {
              const item = draft?.checklist?.find((entry) => entry.id === itemId);
              if (item) item.completedAt = completed ? new Date().toISOString() : null;
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectTaskOverview', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
      ],
    }),

    createComment: builder.mutation({
      query: ({ projectId, taskId, body }) => ({
        url: API_PATHS.PROJECTS.TASKS.COMMENTS(projectId, taskId),
        method: 'post',
        data: { body },
      }),
      invalidatesTags: (result, error, { taskId }) => [{ type: 'Task', id: taskId }],
    }),

    editComment: builder.mutation({
      query: ({ projectId, taskId, commentId, body }) => ({
        url: API_PATHS.PROJECTS.TASKS.COMMENT(projectId, taskId, commentId),
        method: 'patch',
        data: { body },
      }),
      invalidatesTags: (result, error, { taskId }) => [{ type: 'Task', id: taskId }],
    }),

    deleteComment: builder.mutation({
      query: ({ projectId, taskId, commentId }) => ({
        url: API_PATHS.PROJECTS.TASKS.COMMENT(projectId, taskId, commentId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { taskId }) => [{ type: 'Task', id: taskId }],
    }),

    assignTask: builder.mutation({
      query: ({ projectId, taskId, projectMembershipId }) => ({
        url: API_PATHS.PROJECTS.TASKS.ASSIGNEES(projectId, taskId),
        method: 'post',
        data: { projectMembershipId },
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
      ],
    }),

    unassignTask: builder.mutation({
      query: ({ projectId, taskId, projectMembershipId }) => ({
        url: API_PATHS.PROJECTS.TASKS.ASSIGNEE(projectId, taskId, projectMembershipId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        { type: 'ProjectTaskReport', id: projectId },
        'MyTasks',
      ],
    }),

    configureApproval: builder.mutation({
      query: ({ projectId, taskId, approverProjectMembershipId }) => ({
        url: API_PATHS.PROJECTS.TASKS.APPROVAL(projectId, taskId),
        method: 'patch',
        data: { approverProjectMembershipId: approverProjectMembershipId ?? null },
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        'ApprovalQueue',
      ],
    }),

    requestApproval: builder.mutation({
      query: ({ projectId, taskId, reason }) => ({
        url: API_PATHS.PROJECTS.TASKS.APPROVAL_REQUESTS(projectId, taskId),
        method: 'post',
        data: { reason },
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        'ApprovalQueue',
      ],
    }),

    resolveApproval: builder.mutation({
      query: ({ projectId, taskId, action, reason }) => ({
        url: API_PATHS.PROJECTS.TASKS.APPROVAL_ACTION(projectId, taskId, action),
        method: 'post',
        data: { reason },
      }),
      invalidatesTags: (result, error, { projectId, taskId }) => [
        { type: 'Task', id: taskId },
        { type: 'ProjectTaskList', id: projectId },
        { type: 'ProjectTaskBoard', id: projectId },
        'ApprovalQueue',
        'MyTasks',
      ],
    }),

  }),
});

export const exportProjectTasksCsv = async (projectId, params = {}) => {
  const response = await axiosInstance.get(API_PATHS.PROJECTS.TASKS.EXPORT(projectId), {
    params,
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `tasks-${projectId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const {
  // PostgreSQL Hooks
  useGetProjectTasksQuery,
  useGetProjectTaskBoardQuery,
  useGetProjectTaskDetailQuery,
  useGetProjectTaskOverviewQuery,
  useGetProjectTaskReportQuery,
  useGetMyTasksQuery,
  useGetApprovalQueueQuery,
  useCreateProjectTaskMutation,
  useUpdateProjectTaskMutation,
  useArchiveProjectTaskMutation,
  useTransitionTaskStatusMutation,
  useSetTaskManualProgressMutation,
  useAddChecklistItemMutation,
  useSetChecklistItemCompletionMutation,
  useCreateCommentMutation,
  useEditCommentMutation,
  useDeleteCommentMutation,
  useAssignTaskMutation,
  useUnassignTaskMutation,
  useConfigureApprovalMutation,
  useRequestApprovalMutation,
  useResolveApprovalMutation,
} = taskApi;
