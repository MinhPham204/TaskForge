import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosBaseQuery } from './baseQuery.js';
import { API_PATHS } from '../utils/apiPaths.js';

export const searchApi = createApi({
  reducerPath: 'searchApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Search'],
  endpoints: (builder) => ({
    search: builder.query({
      query: ({ query, limit = 8 } = {}) => ({
        url: API_PATHS.SEARCH,
        method: 'get',
        params: { query, limit },
      }),
      providesTags: ['Search'],
    }),
  }),
});

export const {
  useSearchQuery,
  useLazySearchQuery,
} = searchApi;
