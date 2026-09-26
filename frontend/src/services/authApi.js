import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const authApi = createApi({
    reducerPath: 'authApi',
    baseQuery: axiosBaseQuery(),
    tagTypes: ['User', 'Preferences'],
    endpoints: (builder) => ({
        getProfile: builder.query({
            query: () => ({ url: API_PATHS.AUTH.GET_PROFILE, method: 'get' }),
            providesTags: ['User'],
        }),
        updateProfile: builder.mutation({
            query: (profileData) => ({
                url: API_PATHS.AUTH.UPDATE_PROFILE,
                method: 'patch',
                data: profileData,
            }),
            invalidatesTags: ['User'], // Tự động làm mới profile sau khi cập nhật
        }),
        changePassword: builder.mutation({
            query: (passwordData) => ({
                url: API_PATHS.AUTH.CHANGE_PASSWORD, 
                method: 'patch',
                data: passwordData,
            }),
        }),
        getPersonalPreferences: builder.query({
            query: () => ({ url: API_PATHS.AUTH.PREFERENCES, method: 'get' }),
            providesTags: ['Preferences'],
        }),
        updatePersonalPreferences: builder.mutation({
            query: (preferences) => ({
                url: API_PATHS.AUTH.PREFERENCES,
                method: 'patch',
                data: preferences,
            }),
            invalidatesTags: ['Preferences'],
        }),
    }),
});

export const {
    useGetProfileQuery,
    useUpdateProfileMutation,
    useChangePasswordMutation,
    useGetPersonalPreferencesQuery,
    useUpdatePersonalPreferencesMutation,
} = authApi;
