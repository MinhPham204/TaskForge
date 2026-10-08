import { configureStore, createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import authReducer, {
  clearUser,
  fetchMyOrganizations,
  fetchProfile,
  setActiveOrganization,
  setCredentials,
  setSessionFromDev,
  setUser,
  setOrganizationCapabilities,
  invalidateOrganizationCapabilities,
} from "./authSlice.js";
import { setupListeners } from '@reduxjs/toolkit/query';
import { matchesCapabilityScope, sameCapabilities } from '../utils/organizationPermissions.js';
import { taskApi } from "../services/taskApi.js";
import { teamApi } from "../services/teamApi.js";
import { organizationApi } from "../services/organizationApi.js";
import { authApi } from "../services/authApi.js";
import { projectApi } from "../services/projectApi.js";
import { collaborationApi } from "../services/collaborationApi.js";
import { dashboardApi } from "../services/dashboardApi.js";
import { searchApi } from "../services/searchApi.js";
import { ACTIVE_ORG_KEY } from "../utils/axiosInstance.js";

const workspaceListener = createListenerMiddleware();

const removeAuthStorage = () => {
  try {
    ["token", "refreshToken", "authUser", "verifiedToken", ACTIVE_ORG_KEY]
      .forEach((key) => localStorage.removeItem(key));
  } catch (_) {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

const persistActiveOrganization = (organizationId) => {
  try {
    if (organizationId) {
      localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
    } else {
      localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  } catch (_) {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

const resetTenantBoundState = (listenerApi) => {
  resetResourceState(listenerApi);
  listenerApi.dispatch(organizationApi.util.resetApiState());
};

const resetResourceState = (listenerApi) => {
  listenerApi.dispatch(taskApi.util.resetApiState());
  listenerApi.dispatch(teamApi.util.resetApiState());
  listenerApi.dispatch(projectApi.util.resetApiState());
  listenerApi.dispatch(collaborationApi.util.resetApiState());
  listenerApi.dispatch(dashboardApi.util.resetApiState());
  listenerApi.dispatch(searchApi.util.resetApiState());
};

workspaceListener.startListening({
  matcher: isAnyOf(
    setActiveOrganization,
    setCredentials,
    setSessionFromDev,
    setUser,
    fetchProfile.fulfilled,
    fetchMyOrganizations.fulfilled,
    fetchMyOrganizations.rejected,
  ),
  effect: (action, listenerApi) => {
    const previousOrganizationId = listenerApi.getOriginalState().auth.activeOrganizationId;
    const previousUserId = listenerApi.getOriginalState().auth.user?.id;
    const activeOrganizationId = listenerApi.getState().auth.activeOrganizationId;

    persistActiveOrganization(activeOrganizationId);
    if (setCredentials.match(action) || setSessionFromDev.match(action) || previousOrganizationId !== activeOrganizationId || previousUserId !== listenerApi.getState().auth.user?.id) {
      resetTenantBoundState(listenerApi);
    }
  },
});

workspaceListener.startListening({
  matcher: organizationApi.endpoints.getMyOrganizationPermissions.matchFulfilled,
  effect: (action, listenerApi) => {
    const scope = action.meta.arg.originalArgs;
    const auth = listenerApi.getState().auth;
    if (!matchesCapabilityScope(auth, scope)) return;
    const query = organizationApi.endpoints.getMyOrganizationPermissions.select(scope)(listenerApi.getState());
    if (query.requestId !== action.meta.requestId) return;
    const previous = auth.organizationCapabilities;
    listenerApi.dispatch(setOrganizationCapabilities({ scope, capabilities: action.payload }));
    // A changed snapshot discards even cached reads that are no longer visible.
    if (previous && !sameCapabilities(previous, action.payload)) {
      resetTenantBoundState(listenerApi);
    }
  },
});

workspaceListener.startListening({
  matcher: organizationApi.endpoints.getMyOrganizationPermissions.matchRejected,
  effect: (action, listenerApi) => {
    if (action.meta.condition || action.meta.aborted) return;
    const scope = action.meta.arg.originalArgs;
    if (!matchesCapabilityScope(listenerApi.getState().auth, scope)) return;
    const query = organizationApi.endpoints.getMyOrganizationPermissions.select(scope)(listenerApi.getState());
    if (query.requestId !== action.meta.requestId) return;
    listenerApi.dispatch(invalidateOrganizationCapabilities({
      ...scope, refresh: Boolean(listenerApi.getState().auth.organizationCapabilities),
    }));
  },
});

workspaceListener.startListening({
  actionCreator: invalidateOrganizationCapabilities,
  effect: (action, listenerApi) => {
    if (action.payload && !matchesCapabilityScope(listenerApi.getState().auth, action.payload)) return;
    if (listenerApi.getOriginalState().auth.capabilitiesInvalidated) return;
    // Avoid retry loops when permissions/me itself is denied. Other 403s reset
    // the cache so mounted capability subscribers perform one fresh read.
    resetResourceState(listenerApi);
    if (action.payload?.refresh !== false) {
      listenerApi.dispatch(organizationApi.util.resetApiState());
    }
  },
});

workspaceListener.startListening({
  matcher: isAnyOf(clearUser, fetchProfile.rejected),
  effect: (_, listenerApi) => {
    removeAuthStorage();
    resetTenantBoundState(listenerApi);
    listenerApi.dispatch(authApi.util.resetApiState());
  },
});

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [taskApi.reducerPath]: taskApi.reducer,
    [teamApi.reducerPath]: teamApi.reducer,
    [organizationApi.reducerPath]: organizationApi.reducer,
    [projectApi.reducerPath]: projectApi.reducer,
    [collaborationApi.reducerPath]: collaborationApi.reducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [searchApi.reducerPath]: searchApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .prepend(workspaceListener.middleware)
      .concat(
        authApi.middleware,
        taskApi.middleware,
        teamApi.middleware,
        organizationApi.middleware,
        projectApi.middleware,
        collaborationApi.middleware,
        dashboardApi.middleware,
        searchApi.middleware
      ),
});

setupListeners(store.dispatch);
