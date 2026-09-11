import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAcceptInvitationByTokenMutation } from '../../services/organizationApi';
import { fetchMyOrganizations } from '../../store/authSlice.js';

const AcceptInvitePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const token = searchParams.get('token');
  const [message, setMessage] = useState('');
  const [acceptInvitation, result] = useAcceptInvitationByTokenMutation();

  useEffect(() => {
    if (!token) {
      setMessage('This invitation link is missing its secure token.');
      return;
    }

    if (!localStorage.getItem('token')) {
      const currentUrl = `${location.pathname}${location.search}`;
      navigate(`/login?from=${encodeURIComponent(currentUrl)}`, { replace: true });
      return;
    }

    const accept = async () => {
      try {
        await acceptInvitation(token).unwrap();
        await dispatch(fetchMyOrganizations());
      } catch {
        // The mutation state renders a safe error below.
      }
    };
    accept();
  }, [acceptInvitation, dispatch, location.pathname, location.search, navigate, token]);

  useEffect(() => {
    if (result.isSuccess) {
      setMessage('Invitation accepted. Redirecting to your workspace…');
      const timeout = window.setTimeout(() => navigate('/', { replace: true }), 1200);
      return () => window.clearTimeout(timeout);
    }
    if (result.isError) {
      setMessage(result.error?.data?.message || 'Unable to accept this invitation.');
    }
    return undefined;
  }, [navigate, result.error, result.isError, result.isSuccess]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">Accept invitation</h1>
        <p className="mt-4 text-slate-600">
          {result.isLoading ? 'Processing your invitation…' : message}
        </p>
        {(result.isError || !token) && (
          <button type="button" onClick={() => navigate('/workspace/onboarding')} className="btn-primary mt-5">
            Return to workspace setup
          </button>
        )}
      </section>
    </main>
  );
};

export default AcceptInvitePage;
