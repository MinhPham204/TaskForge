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
  const [acceptError, setAcceptError] = useState(false);
  const [acceptInvitation, result] = useAcceptInvitationByTokenMutation();

  useEffect(() => {
    if (!token) {
      setMessage('This invitation link is missing its secure token.');
      return;
    }
    if (!localStorage.getItem('token')) {
      const currentUrl = location.pathname + location.search;
      navigate('/login?from=' + encodeURIComponent(currentUrl), { replace: true });
      return;
    }
    let active = true;
    setAcceptError(false);
    const accept = async () => {
      try {
        await acceptInvitation(token).unwrap();
        if (!active) return;
        await dispatch(fetchMyOrganizations()).unwrap();
        if (active) navigate('/', { replace: true });
      } catch (error) {
        if (!active) return;
        setMessage(error?.data?.message || error?.message || 'Unable to accept this invitation.');
        setAcceptError(true);
      }
    };
    accept();
    return () => { active = false; };
  }, [acceptInvitation, dispatch, location.pathname, location.search, navigate, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="w-full max-w-md rounded-xl bg-surface border border-border p-8 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-content">Accept invitation</h1>
        <p className="mt-4 text-content-muted">
          {result.isLoading ? 'Processing your invitation…' : message}
        </p>
        {(acceptError || result.isError || !token) && (
          <button type="button" onClick={() => navigate('/workspace/onboarding')} className="btn-primary mt-5">
            Return to workspace setup
          </button>
        )}
      </section>
    </main>
  );
};

export default AcceptInvitePage;
