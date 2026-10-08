// src/services/organizationApi.js

import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

/**
 * @typedef {Object} OrganizationRoleSummary
 * @property {string} id
 * @property {string} description
 * @property {number} pendingInvitationCount
 * @property {string} name
 * @property {string|null} systemCode Display only (custom roles have null).
 * @property {boolean} isDefault
 * @property {boolean} isProtected
 * @property {string|null} archivedAt
 * @property {number} version Submit as expectedVersion for role edits.
 * @property {string[]} permissionCodes
 * @property {number} membershipCount
 *
 * @typedef {Object} OrganizationCapabilities
 * @property {boolean} isOwner
 * @property {OrganizationRoleSummary} role
 * @property {string[]} permissions Effective permissions, resolved by the server.
 */

const roleMutationTags = (result, error, { organizationId }) => error ? [] :
    ['OrganizationRoles', 'OrganizationPermissions', 'OrganizationMembers', 'OrganizationInvitations', 'InvitationRoles', 'Organization']
        .map((type) => ({ type, id: organizationId }));

export const organizationApi = createApi({
    reducerPath: 'organizationApi',
    baseQuery: axiosBaseQuery(),
    tagTypes: ['Organization', 'PendingInvitations', 'OrganizationMembers', 'OrganizationInvitations', 'OrganizationPermissions', 'OrganizationRoles', 'InvitationRoles'],
    endpoints: (builder) => ({
        // Both identifiers form the cache key; capabilities cannot cross accounts.
        getMyOrganizationPermissions: builder.query({
            query: ({ organizationId }) => ({ url: API_PATHS.ORGANIZATIONS.MY_PERMISSIONS(organizationId), method: 'get' }),
            providesTags: (result, error, { organizationId }) => [{ type: 'OrganizationPermissions', id: organizationId }],
        }),
        getOrganizationPermissionCatalog: builder.query({
            query: (organizationId) => ({ url: API_PATHS.ORGANIZATIONS.PERMISSION_CATALOG(organizationId), method: 'get' }),
        }),
        getOrganizationRoles: builder.query({
            query: (organizationId) => ({ url: API_PATHS.ORGANIZATIONS.ROLES(organizationId), method: 'get' }),
            providesTags: (result, error, organizationId) => [{ type: 'OrganizationRoles', id: organizationId }],
        }),
        getInvitationRoles: builder.query({
            query: (organizationId) => ({ url: API_PATHS.ORGANIZATIONS.INVITATION_ROLES(organizationId), method: 'get' }),
            providesTags: (result, error, organizationId) => [{ type: 'InvitationRoles', id: organizationId }],
        }),
        createOrganizationRole: builder.mutation({
            query: ({ organizationId, ...data }) => ({ url: API_PATHS.ORGANIZATIONS.ROLES(organizationId), method: 'post', data }),
            invalidatesTags: roleMutationTags,
        }),
        updateOrganizationRole: builder.mutation({
            query: ({ organizationId, roleId, ...data }) => ({ url: API_PATHS.ORGANIZATIONS.ROLE(organizationId, roleId), method: 'patch', data }),
            invalidatesTags: roleMutationTags,
        }),
        replaceOrganizationRolePermissions: builder.mutation({
            query: ({ organizationId, roleId, ...data }) => ({ url: API_PATHS.ORGANIZATIONS.ROLE_PERMISSIONS(organizationId, roleId), method: 'put', data }),
            invalidatesTags: roleMutationTags,
        }),
        archiveOrganizationRole: builder.mutation({
            query: ({ organizationId, roleId, expectedVersion }) => ({ url: API_PATHS.ORGANIZATIONS.ARCHIVE_ROLE(organizationId, roleId), method: 'post', data: { expectedVersion } }),
            invalidatesTags: roleMutationTags,
        }),
        assignOrganizationMemberRole: builder.mutation({
            query: ({ organizationId, userId, roleId }) => ({ url: API_PATHS.ORGANIZATIONS.ASSIGN_MEMBER_ROLE(organizationId, userId), method: 'patch', data: { roleId } }),
            invalidatesTags: roleMutationTags,
        }),
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
            query: ({ organizationId, email, roleId, expiresAt }) => ({
                url: API_PATHS.ORGANIZATIONS.CREATE_INVITATION(organizationId),
                method: 'post',
                data: { email, ...(roleId ? { roleId } : {}), expiresAt },
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
    useGetMyOrganizationPermissionsQuery,
    useGetOrganizationPermissionCatalogQuery,
    useGetOrganizationRolesQuery,
    useGetInvitationRolesQuery,
    useCreateOrganizationRoleMutation,
    useUpdateOrganizationRoleMutation,
    useReplaceOrganizationRolePermissionsMutation,
    useArchiveOrganizationRoleMutation,
    useAssignOrganizationMemberRoleMutation,
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
