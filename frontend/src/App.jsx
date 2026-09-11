import React from 'react'
import { useSelector } from 'react-redux'
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  Navigate,
} from "react-router-dom";

import PrivateRoute from "./routes/PrivateRoutes";
import Login from "./pages/Auth/Login";
import SignUp from "./pages/Auth/SignUp";
import ForgotPassword from './pages/Auth/ForgotPassword';
import Profile from './pages/Account/Profile'
import MyTasks from "./pages/User/MyTasks";
import AcceptInvitePage from "./pages/User/AcceptInvitePage";
import WorkspaceOnboarding from "./pages/Workspace/WorkspaceOnboarding";
import NotificationInbox from "./pages/Workspace/NotificationInbox";
import TeamListPage from "./pages/Teams/TeamListPage";
import TeamDetailPage from "./pages/Teams/TeamDetailPage";
import ProjectListPage from "./pages/Projects/ProjectListPage";
import ProjectDetailPage from "./pages/Projects/ProjectDetailPage";
import ProjectDocumentPage from "./pages/Projects/ProjectDocumentPage";
import DevReviewBanner from "./components/common/DevReviewBanner";
import { isDevMockActive, enableDevMockSession } from "./utils/devMockHandler";
import {
  fetchProfile,
  fetchMyOrganizations,
  selectActiveOrganizationId,
  selectOrganizationsInitialized,
} from './store/authSlice';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';



const App = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    if (isDevMockActive()) {
      enableDevMockSession(dispatch);
      return;
    }
    const token = localStorage.getItem("token");
    if (token) {
      const bootstrapSession = async () => {
        const profileAction = await dispatch(fetchProfile());
        if (fetchProfile.fulfilled.match(profileAction)) {
          dispatch(fetchMyOrganizations());
        }
      };
      bootstrapSession();
    }
  }, [dispatch]);

  return(
        <div>
        <BrowserRouter>
          <DevReviewBanner />
          <Routes>
            <Route path="/login" element={<Login />}/>
            <Route path="/signup" element={<SignUp />}/>
            <Route path="/forgot-password" element={<ForgotPassword />}/>
            <Route path="/profile" element={<Profile />}/>

            {/* Retired route aliases redirect bookmarks to canonical v0.3 paths. */}
            <Route element={<PrivateRoute />}>
              <Route path="/admin/dashboard" element={<Navigate to="/projects" replace />} />
              <Route path="/user/dashboard" element={<Navigate to="/projects" replace />} />
              <Route path="/admin/tasks" element={<Navigate to="/tasks/my" replace />} />
              <Route path="/admin/create-task" element={<Navigate to="/projects" replace />} />
              <Route path="/admin/tasks/edit/:taskId" element={<Navigate to="/projects" replace />} />
              <Route path="/admin/users" element={<Navigate to="/teams" replace />} />
              <Route path="/owner/organization" element={<Navigate to="/teams" replace />} />
              <Route path="/user/my-task" element={<Navigate to="/tasks/my" replace />} />
              <Route path="/user/my-team" element={<Navigate to="/teams" replace />} />
              <Route path="/user/task-detail/:id" element={<Navigate to="/tasks/my" replace />} />

              {/* Canonical v0.3 Workspace, Team, Project, and Task Routes */}
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/workspace/onboarding" element={<WorkspaceOnboarding />} />
              <Route path="/inbox" element={<NotificationInbox />} />
              <Route path="/teams" element={<TeamListPage />} />
              <Route path="/teams/:teamId" element={<TeamDetailPage />} />
              <Route path="/projects" element={<ProjectListPage />} />
              <Route path="/projects/:projectId/documents/:documentId" element={<ProjectDocumentPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/tasks" element={<MyTasks />} />
              <Route path="/tasks/my" element={<MyTasks />} />
              <Route path="/tasks/approval-queue" element={<MyTasks />} />
            </Route>

            <Route path="/" element={<Root/>}/>
          </Routes>
        </BrowserRouter>
       </div>
  )
}

export default App

const Root = () => {
  const { user, loading } = useSelector((state) => state.auth);
  const activeOrganizationId = useSelector(selectActiveOrganizationId);
  const organizationsInitialized = useSelector(selectOrganizationsInitialized);

  if (loading || (user && !organizationsInitialized)) return <Outlet />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (activeOrganizationId) {
    return <Navigate to="/projects" replace />;
  }
  return <Navigate to="/workspace/onboarding" replace />;
};
