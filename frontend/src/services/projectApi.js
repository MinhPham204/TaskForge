import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const projectApi = createApi({
  reducerPath: 'projectApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Project',
    'ProjectParticipant',
    'ProjectStatus',
    'ProjectModule',
    'ProjectMilestone',
    'ProjectDocument',
    'ProjectRisk',
  ],
  endpoints: (builder) => ({
    getProjects: builder.query({
      query: () => ({ url: API_PATHS.PROJECTS.LIST, method: 'get' }),
      providesTags: ['Project'],
    }),

    getProjectById: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.GET_BY_ID(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [{ type: 'Project', id: projectId }],
    }),

    createProject: builder.mutation({
      query: (data) => ({
        url: API_PATHS.PROJECTS.CREATE,
        method: 'post',
        data,
      }),
      invalidatesTags: ['Project'],
    }),

    updateProject: builder.mutation({
      query: ({ projectId, ...data }) => ({
        url: API_PATHS.PROJECTS.UPDATE(projectId),
        method: 'patch',
        data,
      }),
      invalidatesTags: (result, error, { projectId }) => [{ type: 'Project', id: projectId }],
    }),

    transitionProjectLifecycle: builder.mutation({
      query: ({ projectId, command }) => ({
        url: API_PATHS.PROJECTS.LIFECYCLE(projectId, command),
        method: 'post',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'Project', id: projectId },
        'Project',
      ],
    }),

    getProjectTeams: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.PARTICIPANTS.TEAMS(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectParticipant', id: `${projectId}-teams` },
      ],
    }),

    addProjectTeam: builder.mutation({
      query: ({ projectId, teamId }) => ({
        url: API_PATHS.PROJECTS.PARTICIPANTS.TEAMS(projectId),
        method: 'post',
        data: { teamId },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectParticipant', id: `${projectId}-teams` },
        { type: 'ProjectParticipant', id: `${projectId}-members` },
      ],
    }),

    removeProjectTeam: builder.mutation({
      query: ({ projectId, teamId }) => ({
        url: API_PATHS.PROJECTS.PARTICIPANTS.REMOVE_TEAM(projectId, teamId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectParticipant', id: `${projectId}-teams` },
        { type: 'ProjectParticipant', id: `${projectId}-members` },
      ],
    }),

    getProjectMembers: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.PARTICIPANTS.MEMBERS(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectParticipant', id: `${projectId}-members` },
      ],
    }),

    addProjectMember: builder.mutation({
      query: ({ projectId, organizationMembershipId, role }) => ({
        url: API_PATHS.PROJECTS.PARTICIPANTS.MEMBERS(projectId),
        method: 'post',
        data: { organizationMembershipId, role },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectParticipant', id: `${projectId}-members` },
        { type: 'Project', id: projectId },
      ],
    }),

    removeProjectMember: builder.mutation({
      query: ({ projectId, organizationMembershipId }) => ({
        url: API_PATHS.PROJECTS.PARTICIPANTS.REMOVE_MEMBER(projectId, organizationMembershipId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectParticipant', id: `${projectId}-members` },
        { type: 'Project', id: projectId },
      ],
    }),

    getProjectStatuses: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.STATUSES.LIST(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectStatus', id: projectId },
      ],
    }),

    createProjectStatus: builder.mutation({
      query: ({ projectId, name, semanticCategory }) => ({
        url: API_PATHS.PROJECTS.STATUSES.CREATE(projectId),
        method: 'post',
        data: { name, semanticCategory },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectStatus', id: projectId },
      ],
    }),

    renameProjectStatus: builder.mutation({
      query: ({ projectId, statusId, name }) => ({
        url: API_PATHS.PROJECTS.STATUSES.RENAME(projectId, statusId),
        method: 'patch',
        data: { name },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectStatus', id: projectId },
      ],
    }),

    reorderProjectStatus: builder.mutation({
      query: ({ projectId, statusId, position }) => ({
        url: API_PATHS.PROJECTS.STATUSES.REORDER(projectId, statusId),
        method: 'post',
        data: { position },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectStatus', id: projectId },
      ],
    }),

    archiveProjectStatus: builder.mutation({
      query: ({ projectId, statusId }) => ({
        url: API_PATHS.PROJECTS.STATUSES.ARCHIVE(projectId, statusId),
        method: 'post',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectStatus', id: projectId },
      ],
    }),

    getProjectModules: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.MODULES.LIST(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectModule', id: projectId },
      ],
    }),

    setProjectModule: builder.mutation({
      query: ({ projectId, moduleCode, enabled }) => ({
        url: API_PATHS.PROJECTS.MODULES.SET(projectId),
        method: 'post',
        data: { moduleCode, enabled },
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectModule', id: projectId },
      ],
    }),

    // Milestones
    getProjectMilestones: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.MILESTONES.LIST(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectMilestone', id: projectId },
      ],
    }),

    createProjectMilestone: builder.mutation({
      query: ({ projectId, ...data }) => ({
        url: API_PATHS.PROJECTS.MILESTONES.CREATE(projectId),
        method: 'post',
        data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectMilestone', id: projectId },
      ],
    }),

    updateProjectMilestone: builder.mutation({
      query: ({ projectId, milestoneId, ...data }) => ({
        url: API_PATHS.PROJECTS.MILESTONES.UPDATE(projectId, milestoneId),
        method: 'patch',
        data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectMilestone', id: projectId },
      ],
    }),

    closeProjectMilestone: builder.mutation({
      query: ({ projectId, milestoneId }) => ({
        url: API_PATHS.PROJECTS.MILESTONES.CLOSE(projectId, milestoneId),
        method: 'post',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectMilestone', id: projectId },
      ],
    }),

    reopenProjectMilestone: builder.mutation({
      query: ({ projectId, milestoneId }) => ({
        url: API_PATHS.PROJECTS.MILESTONES.REOPEN(projectId, milestoneId),
        method: 'post',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectMilestone', id: projectId },
      ],
    }),

    // Documents
    getProjectDocuments: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.DOCUMENTS.LIST(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectDocument', id: projectId },
      ],
    }),

    getProjectDocumentById: builder.query({
      query: ({ projectId, documentId }) => ({
        url: API_PATHS.PROJECTS.DOCUMENTS.GET(projectId, documentId),
        method: 'get',
      }),
      providesTags: (result, error, { documentId }) => [
        { type: 'ProjectDocument', id: documentId },
      ],
    }),

    createProjectDocument: builder.mutation({
      query: ({ projectId, ...data }) => ({
        url: API_PATHS.PROJECTS.DOCUMENTS.CREATE(projectId),
        method: 'post',
        data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectDocument', id: projectId },
      ],
    }),

    updateProjectDocument: builder.mutation({
      query: ({ projectId, documentId, ...data }) => ({
        url: API_PATHS.PROJECTS.DOCUMENTS.UPDATE(projectId, documentId),
        method: 'patch',
        data,
      }),
      invalidatesTags: (result, error, { projectId, documentId }) => [
        { type: 'ProjectDocument', id: projectId },
        { type: 'ProjectDocument', id: documentId },
      ],
    }),

    archiveProjectDocument: builder.mutation({
      query: ({ projectId, documentId }) => ({
        url: API_PATHS.PROJECTS.DOCUMENTS.ARCHIVE(projectId, documentId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId, documentId }) => [
        { type: 'ProjectDocument', id: projectId },
        { type: 'ProjectDocument', id: documentId },
      ],
    }),

    // Risks
    getProjectRisks: builder.query({
      query: (projectId) => ({
        url: API_PATHS.PROJECTS.RISKS.LIST(projectId),
        method: 'get',
      }),
      providesTags: (result, error, projectId) => [
        { type: 'ProjectRisk', id: projectId },
      ],
    }),

    createProjectRisk: builder.mutation({
      query: ({ projectId, ...data }) => ({
        url: API_PATHS.PROJECTS.RISKS.CREATE(projectId),
        method: 'post',
        data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectRisk', id: projectId },
      ],
    }),

    updateProjectRisk: builder.mutation({
      query: ({ projectId, riskId, ...data }) => ({
        url: API_PATHS.PROJECTS.RISKS.UPDATE(projectId, riskId),
        method: 'patch',
        data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectRisk', id: projectId },
      ],
    }),

    archiveProjectRisk: builder.mutation({
      query: ({ projectId, riskId }) => ({
        url: API_PATHS.PROJECTS.RISKS.ARCHIVE(projectId, riskId),
        method: 'delete',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectRisk', id: projectId },
      ],
    }),

    linkRiskTask: builder.mutation({
      query: ({ projectId, riskId, taskId }) => ({
        url: API_PATHS.PROJECTS.RISKS.LINK_TASK(projectId, riskId, taskId),
        method: 'post',
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'ProjectRisk', id: projectId },
      ],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useGetProjectByIdQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useTransitionProjectLifecycleMutation,
  useGetProjectTeamsQuery,
  useAddProjectTeamMutation,
  useRemoveProjectTeamMutation,
  useGetProjectMembersQuery,
  useAddProjectMemberMutation,
  useRemoveProjectMemberMutation,
  useGetProjectStatusesQuery,
  useCreateProjectStatusMutation,
  useRenameProjectStatusMutation,
  useReorderProjectStatusMutation,
  useArchiveProjectStatusMutation,
  useGetProjectModulesQuery,
  useSetProjectModuleMutation,
  useGetProjectMilestonesQuery,
  useCreateProjectMilestoneMutation,
  useUpdateProjectMilestoneMutation,
  useCloseProjectMilestoneMutation,
  useReopenProjectMilestoneMutation,
  useGetProjectDocumentsQuery,
  useGetProjectDocumentByIdQuery,
  useCreateProjectDocumentMutation,
  useUpdateProjectDocumentMutation,
  useArchiveProjectDocumentMutation,
  useGetProjectRisksQuery,
  useCreateProjectRiskMutation,
  useUpdateProjectRiskMutation,
  useArchiveProjectRiskMutation,
  useLinkRiskTaskMutation,
} = projectApi;
