// src/services/teamApi.js

import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const teamApi = createApi({
    reducerPath: 'teamApi',
    baseQuery: axiosBaseQuery(),
    tagTypes: ['Team'],
    endpoints: (builder) => ({
        // PostgreSQL Team endpoints (P3)
        getTeams: builder.query({
            query: () => ({ url: API_PATHS.TEAM.LIST, method: 'get' }),
            providesTags: ['Team'],
        }),
        getTeamById: builder.query({
            query: (teamId) => ({ url: API_PATHS.TEAM.GET_BY_ID(teamId), method: 'get' }),
            providesTags: (result, error, teamId) => [{ type: 'Team', id: teamId }],
        }),
        createTeam: builder.mutation({
            query: (data) => ({
                url: API_PATHS.TEAM.CREATE,
                method: 'post',
                data,
            }),
            invalidatesTags: ['Team'],
        }),
        updateTeam: builder.mutation({
            query: ({ teamId, ...data }) => ({
                url: API_PATHS.TEAM.UPDATE(teamId),
                method: 'patch',
                data,
            }),
            invalidatesTags: (result, error, { teamId }) => [{ type: 'Team', id: teamId }, 'Team'],
        }),
        archiveTeam: builder.mutation({
            query: (teamId) => ({
                url: API_PATHS.TEAM.ARCHIVE(teamId),
                method: 'post',
            }),
            invalidatesTags: ['Team'],
        }),
        addTeamMember: builder.mutation({
            query: ({ teamId, organizationMembershipId }) => ({
                url: API_PATHS.TEAM.ADD_MEMBER(teamId),
                method: 'post',
                data: { organizationMembershipId },
            }),
            invalidatesTags: (result, error, { teamId }) => [{ type: 'Team', id: teamId }],
        }),
        removeTeamMember: builder.mutation({
            query: ({ teamId, organizationMembershipId }) => ({
                url: API_PATHS.TEAM.REMOVE_MEMBER_RELATION(teamId, organizationMembershipId),
                method: 'delete',
            }),
            invalidatesTags: (result, error, { teamId }) => [{ type: 'Team', id: teamId }],
        }),
    }),
});

export const {
    useGetTeamsQuery,
    useGetTeamByIdQuery,
    useLazyGetTeamByIdQuery,
    useCreateTeamMutation,
    useUpdateTeamMutation,
    useArchiveTeamMutation,
    useAddTeamMemberMutation,
    useRemoveTeamMemberMutation,
} = teamApi;
