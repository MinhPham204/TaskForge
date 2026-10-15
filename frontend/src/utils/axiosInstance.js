import axios from "axios";
import { BASE_URL, API_PATHS } from "./apiPaths.js";
import { isDevMockActive } from "./devMockHandler.js";

export const ACTIVE_ORG_KEY = "activeOrganizationId";

// ─────────────────────────────────────────────────────────────────────────────
// Public routes: không cần Access Token
// ─────────────────────────────────────────────────────────────────────────────
const PUBLIC_ROUTES = [
  API_PATHS.AUTH.LOGIN,
  API_PATHS.AUTH.REGISTER,
  API_PATHS.AUTH.VERIFY_OTP,
  API_PATHS.AUTH.REQUEST_PASSWORD_RESET,
  API_PATHS.AUTH.RESET_PASSWORD,
];

// Routes chỉ cần verifiedToken (thay vì accessToken)
const VERIFIED_TOKEN_ROUTES = [
  API_PATHS.AUTH.SET_PASSWORD,
];

/**
 * Kiểm tra xem endpoint có yêu cầu tenant header (x-organization-id) hay không.
 *
 * Auth, workspace discovery, invitation response, and Organization creation
 * are control-plane routes. Project/Team/Task/Notification requests and
 * Organization invitation management require a verified active Membership.
 */
export const isTenantScopedRequest = (url = "") => {
  if (!url) return false;
  const cleanUrl = requestPath(url).toLowerCase();

  if (
    cleanUrl.startsWith("/api/auth") ||
    cleanUrl.startsWith("api/auth") ||
    cleanUrl === "/api/workspaces" ||
    cleanUrl === "api/workspaces" ||
    cleanUrl === "/api/invitations" ||
    cleanUrl === "api/invitations" ||
    cleanUrl === "/api/invitations/accept" ||
    cleanUrl === "api/invitations/accept"
  ) {
    return false;
  }

  if (cleanUrl === "/api/organizations" || cleanUrl === "api/organizations") {
    return false;
  }

  return (
    cleanUrl.startsWith("/api/tasks") ||
    cleanUrl.startsWith("api/tasks") ||
    cleanUrl.startsWith("/api/teams") ||
    cleanUrl.startsWith("api/teams") ||
    cleanUrl.startsWith("/api/organizations") ||
    cleanUrl.startsWith("api/organizations") ||
    cleanUrl.startsWith("/api/projects") ||
    cleanUrl.startsWith("api/projects") ||
    cleanUrl.startsWith("/api/notifications") ||
    cleanUrl.startsWith("api/notifications") ||
    cleanUrl.startsWith("/api/dashboard") ||
    cleanUrl.startsWith("api/dashboard") ||
    cleanUrl.startsWith("/api/search") ||
    cleanUrl.startsWith("api/search")
  );
};

const clearTenantHeader = (headers) => {
  delete headers["x-organization-id"];
  delete headers["X-Organization-Id"];
};

/**
 * Apply the current active workspace at the final request boundary.
 * Every initial request and every retry passes through this function, so a
 * queued request cannot reuse the workspace header captured before refresh.
 */
export const applyTenantHeader = (config) => {
  config.headers = config.headers || {};

  if (!isTenantScopedRequest(config.url, config.method)) {
    clearTenantHeader(config.headers);
    return config;
  }

  let activeOrgId = null;
  try {
    activeOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
  } catch (_) {
    // Treat unavailable storage as missing tenant context.
  }

  const normalizedOrganizationId =
    typeof activeOrgId === "string" ? activeOrgId.trim() : "";

  if (
    normalizedOrganizationId &&
    normalizedOrganizationId !== "null" &&
    normalizedOrganizationId !== "undefined"
  ) {
    config.headers["x-organization-id"] = normalizedOrganizationId;
  } else {
    clearTenantHeader(config.headers);
  }

  return config;
};

// ─────────────────────────────────────────────────────────────────────────────
// Axios instance chính
// ─────────────────────────────────────────────────────────────────────────────
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Refresh Token Queue — xử lý nhiều request cùng lúc bị 401
// ─────────────────────────────────────────────────────────────────────────────
let refreshPromise = null;
let lastRefresh = null;
let onSessionExpired = () => {};
let onSessionRefreshed = () => {};
export const setSessionRefreshHandler = handler => { onSessionRefreshed = handler; };
export const setSessionExpiryHandler = (handler) => { onSessionExpired = handler; };
const stored = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const requestPath = (url = '') => {
  try { return new URL(url, BASE_URL).pathname; } catch { return url.split('?')[0]; }
};
const requestKind = (url) => {
  const path = requestPath(url);
  if (PUBLIC_ROUTES.includes(path)) return 'public';
  if (VERIFIED_TOKEN_ROUTES.includes(path)) return 'verified';
  if (path === API_PATHS.AUTH.REFRESH_TOKEN) return 'refresh';
  return 'protected';
};
const forceLogout = () => {
  onSessionExpired();
  try { ['token', 'refreshToken', 'authUser', 'verifiedToken', ACTIVE_ORG_KEY].forEach(key => localStorage.removeItem(key)); }
  catch { /* unavailable storage */ }
  window.location.href = '/login';
};

axiosInstance.interceptors.request.use(
  (config) => {
    const kind = requestKind(config.url);
    config.headers.delete('Authorization');
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) config.headers.set('Content-Type', undefined);
    if (kind === 'verified') {
      const token = stored('verifiedToken');
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
    } else if (kind === 'protected') {
      const token = stored('token');
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
      config._sessionAccessToken = token;
      config._sessionRefreshToken = stored('refreshToken');
    } else if (kind === 'refresh') {
      const token = stored('refreshToken');
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
      config._sessionRefreshToken = token;
    }
    return applyTenantHeader(config);
  },
  (error) => Promise.reject(error)
);

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE INTERCEPTOR
// Tự động refresh accessToken khi nhận lỗi 401
// ─────────────────────────────────────────────────────────────────────────────
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest || isDevMockActive()) throw error;
    const kind = requestKind(originalRequest.url);
    if (kind === 'public' || kind === 'verified') throw error;
    if (kind === 'refresh' && [401, 403].includes(error.response?.status)) {
      if (originalRequest._sessionRefreshToken === stored('refreshToken')) forceLogout();
      throw error;
    }
    if (error.response?.status !== 401) throw error;
    const currentSession = originalRequest._sessionAccessToken === stored('token') && originalRequest._sessionRefreshToken === stored('refreshToken');
    if (!currentSession) {
      if (!originalRequest._retry && lastRefresh && originalRequest._sessionAccessToken === lastRefresh.previousAccess &&
          originalRequest._sessionRefreshToken === lastRefresh.previousRefresh && stored('token') === lastRefresh.access &&
          stored('refreshToken') === lastRefresh.refresh) {
        originalRequest._retry = true;
        return axiosInstance(originalRequest);
      }
      throw error; // An old account response cannot replay or erase a newer session.
    }
    if (originalRequest._retry) { forceLogout(); throw error; }
    originalRequest._retry = true;
    const refreshToken = stored('refreshToken');
    if (!refreshToken) { forceLogout(); throw error; }
    if (!refreshPromise) {
      const accessToken = stored('token');
      refreshPromise = axios.post(`${BASE_URL}${API_PATHS.AUTH.REFRESH_TOKEN}`, {}, {
        timeout: 10000, headers: { Authorization: `Bearer ${refreshToken}`, 'Content-Type': 'application/json' },
      }).then(({ data }) => {
        if (stored('refreshToken') !== refreshToken || stored('token') !== accessToken) throw error;
        if (typeof data?.accessToken !== 'string' || !data.accessToken || typeof data.refreshToken !== 'string' || !data.refreshToken) {
          const invalid = new Error('Invalid refresh response'); invalid.invalidRefreshResponse = true; throw invalid;
        }
        localStorage.setItem('token', data.accessToken);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        lastRefresh = { previousAccess: accessToken, previousRefresh: refreshToken, access: data.accessToken, refresh: stored('refreshToken') };
        onSessionRefreshed({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return data.accessToken;
      }).catch(refreshError => {
        if (([401, 403].includes(refreshError.response?.status) || refreshError.invalidRefreshResponse) && stored('refreshToken') === refreshToken && stored('token') === accessToken) forceLogout();
        throw refreshError;
      }).finally(() => { refreshPromise = null; });
    }
    const token = await refreshPromise;
    if (stored('token') !== token) throw error;
    return axiosInstance(originalRequest);

  }
);

export default axiosInstance;
