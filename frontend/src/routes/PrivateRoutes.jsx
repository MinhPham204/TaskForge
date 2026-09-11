import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectActiveOrganizationId } from '../store/authSlice.js'

const PrivateRoutes = () => {
  const location = useLocation();
  const { user, loading, isOrganizationsLoading, organizationsInitialized } = useSelector((state) => state.auth);
  const activeOrganizationId = useSelector(selectActiveOrganizationId);

  if (loading || (user && (!organizationsInitialized || isOrganizationsLoading))) {
    return (
      <main
        className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
        aria-busy="true"
      >
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div
            className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary"
            aria-hidden="true"
          />
          <h1 className="text-base font-semibold text-slate-900">
            Loading your workspace
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Verifying your session and available organizations.
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }

  if (!activeOrganizationId && location.pathname !== '/workspace/onboarding') {
    return <Navigate to="/workspace/onboarding" replace />;
  }

  return <Outlet/>
}

export default PrivateRoutes
