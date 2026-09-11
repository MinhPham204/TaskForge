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
  const cleanUrl = url.split("?")[0].toLowerCase();

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
    cleanUrl.startsWith("api/notifications")
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
let isRefreshing = false;
let failedQueue  = [];

/**
 * processQueue: sau khi refresh xong, resolve/reject tất cả request đang chờ.
 * @param {Error|null} error  - null nếu refresh thành công
 * @param {string|null} token - accessToken mới nếu thành công
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

/** Xóa sạch auth data khỏi localStorage và chuyển về trang login */
const forceLogout = () => {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("authUser");
    localStorage.removeItem("verifiedToken");
    localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch (_) {
    // no-op
  }
  window.location.href = "/login";
};

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST INTERCEPTOR
// Đính kèm Bearer Token & x-organization-id phù hợp vào mỗi request
// ─────────────────────────────────────────────────────────────────────────────
axiosInstance.interceptors.request.use(
  (config) => {
    const url = config.url || "";

    // 1. Public routes → không đính kèm token hoặc tenant header
    if (PUBLIC_ROUTES.some((route) => url.includes(route))) {
      return applyTenantHeader(config);
    }

    // 2. Set-password → dùng verifiedToken (JWT ngắn hạn từ bước xác minh OTP)
    if (VERIFIED_TOKEN_ROUTES.some((route) => url.includes(route))) {
      const verifiedToken = localStorage.getItem("verifiedToken");
      if (verifiedToken) {
        config.headers.Authorization = `Bearer ${verifiedToken}`;
      }
      return applyTenantHeader(config);
    }

    // 3. Mọi route còn lại → dùng accessToken
    const accessToken = localStorage.getItem("token");
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // 4. Header Injection theo tenant boundary
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

    // Chỉ xử lý lỗi 401
    if (error.response?.status !== 401) {
      if (error.response?.status === 500) {
        console.error("Server error. Please try again later.");
      } else if (error.code === "ECONNABORTED") {
        console.error("Request timeout. Please try again.");
      }
      return Promise.reject(error);
    }

    // ── Nếu chính endpoint refresh bị 401 → refresh token hết hạn/invalid
    //    → logout ngay, không retry nữa
    // The local review helper deliberately uses an in-memory mock token. A
    // request not covered by the helper may receive a real 401, but it must
    // not erase the mock session or redirect the reviewer to /login.
    if (isDevMockActive()) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes(API_PATHS.AUTH.REFRESH_TOKEN)) {
      processQueue(error, null);
      forceLogout();
      return Promise.reject(error);
    }

    // ── Nếu đang có refresh đang chạy → xếp request vào hàng chờ
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newAccessToken) => {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axiosInstance(originalRequest);
        })
        .catch((queueError) => Promise.reject(queueError));
    }

    // ── Đánh dấu request này đã được retry 1 lần (tránh vòng lặp vô hạn)
    if (originalRequest._retry) {
      forceLogout();
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    isRefreshing           = true;

    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken) {
      isRefreshing = false;
      forceLogout();
      return Promise.reject(error);
    }

    try {
      // Dùng axios thuần (KHÔNG dùng axiosInstance) để tránh interceptor loop
      const { data } = await axios.post(
        `${BASE_URL}${API_PATHS.AUTH.REFRESH_TOKEN}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Lưu tokens mới vào localStorage
      localStorage.setItem("token", data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem("refreshToken", data.refreshToken);
      }

      // Resolve tất cả request đang xếp hàng với token mới
      processQueue(null, data.accessToken);

      // Retry original request với accessToken mới và active organization hiện tại
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      // Refresh thất bại → đẩy lỗi cho tất cả request đang chờ → logout
      processQueue(refreshError, null);
      forceLogout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default axiosInstance;
