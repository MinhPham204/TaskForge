// src/services/organizationApi.js

import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const organizationApi = createApi({
    reducerPath: 'organizationApi',
    baseQuery: axiosBaseQuery(),
    tagTypes: ['Organization', 'PendingInvitations', 'OrganizationMembers', 'OrganizationInvitations'],
    endpoints: (builder) => ({
        createOrganization: builder.mutation({
            query: (orgData) => ({
                url: API_PATHS.ORGANIZATIONS.CREATE_ORG,
                method: 'post',
                data: orgData,
            }),
            invalidatesTags: ['Organization'],
        }),

        acceptInvitationByToken: builder.mutation({
            query: (token) => ({
                url: API_PATHS.INVITATIONS.ACCEPT,
                method: 'post',
                data: { token },
            }),
            invalidatesTags: ['Organization', 'PendingInvitations'],
        }),

        getPendingInvitations: builder.query({
            query: () => ({
                url: API_PATHS.INVITATIONS.LIST,
                method: 'get',
            }),
            providesTags: ['PendingInvitations'],
        }),

        getOrganizationSettings: builder.query({
            query: (organizationId) => ({
                url: API_PATHS.ORGANIZATIONS.GET_BY_ID(organizationId),
                method: 'get',
            }),
            providesTags: (result, error, organizationId) => [{ type: 'Organization', id: organizationId }],
        }),

        updateOrganization: builder.mutation({
            query: ({ organizationId, ...data }) => ({
                url: API_PATHS.ORGANIZATIONS.UPDATE(organizationId),
                method: 'patch',
                data,
            }),
            invalidatesTags: (result, error, { organizationId }) => [{ type: 'Organization', id: organizationId }],
        }),

        getOrganizationMembers: builder.query({
            query: (organizationId) => ({
                url: API_PATHS.ORGANIZATIONS.MEMBERS(organizationId),
                method: 'get',
            }),
            providesTags: (result, error, organizationId) => [{ type: 'OrganizationMembers', id: organizationId }],
        }),

        getOrganizationInvitations: builder.query({
            query: (organizationId) => ({
                url: API_PATHS.ORGANIZATIONS.INVITATIONS(organizationId),
                method: 'get',
            }),
            providesTags: (result, error, organizationId) => [{ type: 'OrganizationInvitations', id: organizationId }],
        }),

        createOrganizationInvitation: builder.mutation({
            query: ({ organizationId, ...data }) => ({
                url: API_PATHS.ORGANIZATIONS.CREATE_INVITATION(organizationId),
                method: 'post',
                data,
            }),
            invalidatesTags: (result, error, { organizationId }) => [{ type: 'OrganizationInvitations', id: organizationId }],
        }),

        revokeOrganizationInvitation: builder.mutation({
            query: ({ organizationId, invitationId }) => ({
                url: API_PATHS.ORGANIZATIONS.REVOKE_INVITATION(organizationId, invitationId),
                method: 'delete',
            }),
            invalidatesTags: (result, error, { organizationId }) => [{ type: 'OrganizationInvitations', id: organizationId }],
        }),

        suspendOrganizationMember: builder.mutation({
            query: ({ organizationId, userId }) => ({
                url: API_PATHS.ORGANIZATIONS.SUSPEND_MEMBER(organizationId, userId),
                method: 'post',
            }),
            invalidatesTags: (result, error, { organizationId }) => [{ type: 'OrganizationMembers', id: organizationId }],
        }),

        revokeOrganizationMember: builder.mutation({
            query: ({ organizationId, userId }) => ({
                url: API_PATHS.ORGANIZATIONS.REVOKE_MEMBER(organizationId, userId),
                method: 'delete',
            }),
            invalidatesTags: (result, error, { organizationId }) => [{ type: 'OrganizationMembers', id: organizationId }],
        }),

        leaveOrganization: builder.mutation({
            query: (organizationId) => ({
                url: API_PATHS.ORGANIZATIONS.LEAVE(organizationId),
                method: 'post',
            }),
            invalidatesTags: ['Organization', 'OrganizationMembers'],
        }),
    }),
});

export const {
    useCreateOrganizationMutation,
    useAcceptInvitationByTokenMutation,
    useGetPendingInvitationsQuery,
    useGetOrganizationSettingsQuery,
    useUpdateOrganizationMutation,
    useGetOrganizationMembersQuery,
    useGetOrganizationInvitationsQuery,
    useCreateOrganizationInvitationMutation,
    useRevokeOrganizationInvitationMutation,
    useSuspendOrganizationMemberMutation,
    useRevokeOrganizationMemberMutation,
    useLeaveOrganizationMutation,
} = organizationApi;

