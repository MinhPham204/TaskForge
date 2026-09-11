// src/services/organizationApi.js

import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const organizationApi = createApi({
    reducerPath: 'organizationApi',
    baseQuery: axiosBaseQuery(),
    tagTypes: ['Organization', 'PendingInvitations'],
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
    }),
});

export const {
    useCreateOrganizationMutation,
    useAcceptInvitationByTokenMutation,
    useGetPendingInvitationsQuery,
} = organizationApi;
