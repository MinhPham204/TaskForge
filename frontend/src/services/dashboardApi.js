import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Dashboard'],
  endpoints: (builder) => ({
    getDashboard: builder.query({
      query: () => ({ url: API_PATHS.DASHBOARD, method: 'get' }),
      providesTags: ['Dashboard'],
    }),
  }),
});

export const { useGetDashboardQuery } = dashboardApi;
