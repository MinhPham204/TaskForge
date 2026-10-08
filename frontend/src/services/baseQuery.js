import axiosInstance from '../utils/axiosInstance.js';
import { handleDevMockRequest, isDevMockActive } from '../utils/devMockHandler.js';

export const axiosBaseQuery = ({ baseUrl } = { baseUrl: '' }) =>
  async ({ url, method, data, params }, api) => {
    const auth = api?.getState()?.auth;
    const scope = { userId: auth?.user?.id, organizationId: auth?.activeOrganizationId };
    // Development review & testing mock interceptor
    if (isDevMockActive()) {
      const mockResult = await handleDevMockRequest({
        url: baseUrl + url,
        method: method || 'get',
        data,
        params,
      });
      if (mockResult) {
        return mockResult.error ? { error: mockResult.error } : { data: mockResult.data };
      }
      return { error: { status: 501, data: { message: 'This action is not available in the local preview.' } } };
    }

    try {
      const result = await axiosInstance({
        url: baseUrl + url,
        method,
        data,
        params,
      });
      return { data: result.data };
    } catch (axiosError) {
      let err = axiosError;
      if (err.response?.status === 403 && scope.organizationId && !url.endsWith('/permissions/me')) {
        api.dispatch({ type: 'auth/invalidateOrganizationCapabilities', payload: scope });
      }
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data || err.message,
        },
      };
    }
  };
