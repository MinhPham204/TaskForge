import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance, { ACTIVE_ORG_KEY } from "../utils/axiosInstance.js";
import { API_PATHS } from "../utils/apiPaths.js";

// ─────────────────────────────────────────────
// Helpers: đồng bộ localStorage ↔ Redux state
// ─────────────────────────────────────────────
const getStoredItem = (key) => {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch (_) {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return null;
};

const setStoredItem = (key, val) => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, val);
    }
  } catch (_) {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

const persistAuth = ({ accessToken, refreshToken, user }) => {
  if (accessToken)  setStoredItem("token", accessToken);
  if (refreshToken) setStoredItem("refreshToken", refreshToken);
  if (user)         setStoredItem("authUser", JSON.stringify(user));
};

// ─────────────────────────────────────────────
// Hydrate initial state từ localStorage
// ─────────────────────────────────────────────
const userFromStorage = (() => {
  try {
    const raw = getStoredItem("authUser");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
})();

const initialState = {
  user: userFromStorage,
  accessToken:  getStoredItem("token"),
  refreshToken: getStoredItem("refreshToken"),
  loading: false,
  error: null,

  // Workspace state
  organizations: [],
  activeOrganizationId: null,
  activeOrganization: null,
  isOrganizationsLoading: false,
  organizationsInitialized: false,
  organizationsError: null,
};

// ─────────────────────────────────────────────
// Async Thunks
// ─────────────────────────────────────────────

/** Bootstrap user profile từ token */
export const fetchProfile = createAsyncThunk(
  "auth/fetchProfile",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get(API_PATHS.AUTH.GET_PROFILE);
      return response.data;
    } catch (error) {
      return rejectWithValue(error?.response?.data || { message: "Unauthorized" });
    }
  }
);

/** Workspace discovery: lấy danh sách organization mà user có active membership */
export const fetchMyOrganizations = createAsyncThunk(
  "auth/fetchMyOrganizations",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get(API_PATHS.AUTH.MY_ORGANIZATIONS);
      return response.data; // Array of WorkspaceOrganizationDto: [{ organizationId, name, slug, logoUrl, role, joinedAt }]
    } catch (error) {
      return rejectWithValue(error?.response?.data || { message: "Failed to fetch organizations" });
    }
  }
);

// ─────────────────────────────────────────────
// Slice
// ─────────────────────────────────────────────
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /**
     * setCredentials: gọi sau khi login / set-password thành công.
     */
    setCredentials(state, action) {
      const { accessToken, refreshToken, user } = action.payload;
      state.user         = user;
      state.accessToken  = accessToken;
      state.refreshToken = refreshToken;
      state.loading      = false;
      state.error        = null;
      persistAuth({ accessToken, refreshToken, user });
    },

    /**
     * setUser: backward-compat nếu chỉ cần cập nhật user object.
     */
    setUser(state, action) {
      state.user    = action.payload;
      state.loading = false;
      state.error   = null;
      setStoredItem("authUser", JSON.stringify(action.payload));
    },

    /**
     * updateTokens: axiosInstance gọi sau khi refresh thành công
     */
    updateTokens(state, action) {
      const { accessToken, refreshToken } = action.payload;
      state.accessToken  = accessToken;
      if (refreshToken) state.refreshToken = refreshToken;
      setStoredItem("token", accessToken);
      if (refreshToken) setStoredItem("refreshToken", refreshToken);
    },

    /**
     * Pure reducer chỉ cập nhật workspace được chọn. Store listener chịu trách
     * nhiệm persist selection và purge tenant-bound state khi ID thay đổi.
     */
    setActiveOrganization(state, action) {
      const orgId = action.payload;
      const found = state.organizations.find((o) => o.organizationId === orgId);
      if (found) {
        state.activeOrganizationId = found.organizationId;
        state.activeOrganization   = found;
      } else {
        state.activeOrganizationId = null;
        state.activeOrganization   = null;
      }
    },

    /** clearUser: logout hoàn toàn — xóa state + localStorage */
    clearUser(state) {
      state.user                   = null;
      state.accessToken            = null;
      state.refreshToken           = null;
      state.loading                = false;
      state.error                  = null;
      state.organizations          = [];
      state.activeOrganizationId   = null;
      state.activeOrganization     = null;
      state.isOrganizationsLoading = false;
      state.organizationsInitialized = false;
      state.organizationsError     = null;
    },

    /** setSessionFromDev: hỗ trợ review/testing nhanh trong dev mode */
    setSessionFromDev(state, action) {
      const { user, organizations, activeOrganizationId } = action.payload;
      state.user = user;
      state.accessToken = 'dev-mock-token';
      state.organizations = organizations || [];
      state.activeOrganizationId = activeOrganizationId || organizations?.[0]?.organizationId || null;
      state.activeOrganization = organizations?.[0] || null;
      state.organizationsInitialized = true;
      state.isOrganizationsLoading = false;
      state.loading = false;
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      // fetchProfile
      .addCase(fetchProfile.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.user    = action.payload;
        state.loading = false;
        setStoredItem("authUser", JSON.stringify(action.payload));
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.user                   = null;
        state.accessToken            = null;
        state.refreshToken           = null;
        state.loading                = false;
        state.error                  = action.payload?.message || "Unauthorized";
        state.organizations          = [];
        state.activeOrganizationId   = null;
        state.activeOrganization     = null;
        state.organizationsInitialized = false;
      })

      // fetchMyOrganizations
      .addCase(fetchMyOrganizations.pending, (state) => {
        state.isOrganizationsLoading = true;
        state.organizationsError     = null;
      })
      .addCase(fetchMyOrganizations.fulfilled, (state, action) => {
        const orgs = Array.isArray(action.payload) ? action.payload : [];
        state.organizations          = orgs;
        state.isOrganizationsLoading = false;
        state.organizationsInitialized = true;
        state.organizationsError     = null;

        // Đối chiếu persisted organizationId với danh sách mới từ server
        const persistedOrgId = getStoredItem(ACTIVE_ORG_KEY);

        let selectedOrg = null;
        if (persistedOrgId) {
          selectedOrg = orgs.find((o) => o.organizationId === persistedOrgId) || null;
        }
        // Nếu persisted ID không còn hợp lệ, chọn workspace hợp lệ đầu tiên
        if (!selectedOrg && orgs.length > 0) {
          selectedOrg = orgs[0];
        }

        if (selectedOrg) {
          state.activeOrganizationId = selectedOrg.organizationId;
          state.activeOrganization   = selectedOrg;
        } else {
          // Danh sách rỗng: activeOrganization & activeOrganizationId là null, KHÔNG fallback legacy user.organization
          state.activeOrganizationId = null;
          state.activeOrganization   = null;
        }
      })
      .addCase(fetchMyOrganizations.rejected, (state, action) => {
        state.isOrganizationsLoading = false;
        state.organizationsInitialized = true;
        state.organizationsError     = action.payload?.message || "Failed to fetch organizations";
        state.organizations          = [];
        state.activeOrganizationId   = null;
        state.activeOrganization     = null;
      });
  },
});

export const {
  setCredentials,
  setUser,
  updateTokens,
  setActiveOrganization,
  clearUser,
  setSessionFromDev,
} = authSlice.actions;

export default authSlice.reducer;

// ─────────────────────────────────────────────
// Action Thunks (State & Cache Isolation)
// ─────────────────────────────────────────────

/**
 * switchOrganization: chuyển active workspace an toàn.
 * a. Cập nhật active workspace trong authSlice & localStorage
 * b. Reset toàn bộ tenant-bound RTK Query caches.
 */
export const switchOrganization = (newOrgId) => (dispatch) => {
  dispatch(setActiveOrganization(newOrgId));
};

/**
 * logout: đăng xuất an toàn.
 * Xóa auth credentials và purge toàn bộ tenant-bound caches & states.
 */
export const logout = () => (dispatch) => {
  dispatch(clearUser());
};

// ─────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────
/** Danh sách workspaces mà user tham gia */
export const selectOrganizations          = (state) => state.auth.organizations;
/** Active workspace object ({ organizationId, name, slug, logoUrl, role, joinedAt }) */
export const selectActiveOrganization     = (state) => state.auth.activeOrganization;
/** Active organization UUID string. */
export const selectActiveOrganizationId   = (state) => state.auth.activeOrganizationId;
/** Workspace role từ active Membership ("owner" | "admin" | "member" | null) */
export const selectRole                   = (state) => {
  const role = state.auth.activeOrganization?.role;
  return typeof role === "string" ? role.toLowerCase() : null;
};
/** Backward-compatible alias cho selectActiveOrganizationId */
export const selectOrganizationId         = (state) => state.auth.activeOrganizationId ?? null;
/** Trạng thái loading workspace discovery */
export const selectIsOrganizationsLoading = (state) => state.auth.isOrganizationsLoading;
/** Workspace discovery đã hoàn thành ít nhất một lần trong session hiện tại */
export const selectOrganizationsInitialized = (state) => state.auth.organizationsInitialized;
