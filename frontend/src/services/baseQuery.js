import axiosInstance from '../utils/axiosInstance.js';
import { handleDevMockRequest, isDevMockActive } from '../utils/devMockHandler.js';

export const axiosBaseQuery = ({ baseUrl } = { baseUrl: '' }) =>
  async ({ url, method, data, params }) => {
    // Development review & testing mock interceptor
    if (isDevMockActive()) {
      const mockResult = await handleDevMockRequest({
        url: baseUrl + url,
        method: method || 'get',
        data,
        params,
      });
      if (mockResult) {
        return { data: mockResult.data };
      }
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
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data || err.message,
        },
      };
    }
  };
