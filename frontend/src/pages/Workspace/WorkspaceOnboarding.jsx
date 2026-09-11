import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import PendingInvitations from '../../components/PendingInvitations.jsx';
import { useCreateOrganizationMutation } from '../../services/organizationApi.js';
import {
  fetchMyOrganizations,
  selectActiveOrganizationId,
  switchOrganization,
} from '../../store/authSlice.js';

const WorkspaceOnboarding = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const activeOrganizationId = useSelector(selectActiveOrganizationId);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [createOrganization, { isLoading }] = useCreateOrganizationMutation();

  const handleCreateWorkspace = async (event) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError('Enter a workspace name.');
      return;
    }

    setError('');
    try {
      const result = await createOrganization({ name: normalizedName }).unwrap();
      const organizationId = result.organizationId;
      await dispatch(fetchMyOrganizations());
      if (organizationId) {
        dispatch(switchOrganization(organizationId));
      }
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(
        requestError?.data?.message || 'Unable to create the workspace. Please try again.',
      );
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Get started</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            {activeOrganizationId ? 'Create a workspace' : 'Choose a workspace'}
          </h1>
          <p className="mt-3 text-slate-600">
            {activeOrganizationId
              ? 'Create an additional workspace for a new team, client, or initiative.'
              : 'Create a workspace for your work, or accept an invitation you have received.'}
          </p>
        </header>

        <form onSubmit={handleCreateWorkspace} className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create a workspace</h2>
          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="workspace-name">
            Workspace name
          </label>
          <input
            id="workspace-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Studio"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-primary"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={isLoading} className="btn-primary mt-4 disabled:opacity-60">
            {isLoading ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>

        <PendingInvitations />
      </section>
    </main>
  );
};

export default WorkspaceOnboarding;
