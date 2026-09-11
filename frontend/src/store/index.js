import { configureStore, createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import authReducer, {
  clearUser,
  fetchMyOrganizations,
  fetchProfile,
  setActiveOrganization,
} from "./authSlice.js";
import { taskApi } from "../services/taskApi.js";
import { teamApi } from "../services/teamApi.js";
import { organizationApi } from "../services/organizationApi.js";
import { authApi } from "../services/authApi.js";
import { projectApi } from "../services/projectApi.js";
import { collaborationApi } from "../services/collaborationApi.js";
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
  listenerApi.dispatch(taskApi.util.resetApiState());
  listenerApi.dispatch(teamApi.util.resetApiState());
  listenerApi.dispatch(organizationApi.util.resetApiState());
  listenerApi.dispatch(projectApi.util.resetApiState());
  listenerApi.dispatch(collaborationApi.util.resetApiState());
};

workspaceListener.startListening({
  matcher: isAnyOf(
    setActiveOrganization,
    fetchMyOrganizations.fulfilled,
    fetchMyOrganizations.rejected,
  ),
  effect: (_, listenerApi) => {
    const previousOrganizationId = listenerApi.getOriginalState().auth.activeOrganizationId;
    const activeOrganizationId = listenerApi.getState().auth.activeOrganizationId;

    persistActiveOrganization(activeOrganizationId);
    if (previousOrganizationId !== activeOrganizationId) {
      resetTenantBoundState(listenerApi);
    }
  },
});

workspaceListener.startListening({
  matcher: isAnyOf(clearUser, fetchProfile.rejected),
  effect: (_, listenerApi) => {
    removeAuthStorage();
    resetTenantBoundState(listenerApi);
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
        collaborationApi.middleware
      ),
});
