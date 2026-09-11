import React from 'react';
import { LuBuilding2, LuClock } from 'react-icons/lu';
import { useGetPendingInvitationsQuery } from '../services/organizationApi';

const PendingInvitations = () => {
  const { data = [], isLoading, isError, error, refetch } =
    useGetPendingInvitationsQuery();

  if (isLoading) {
    return (
      <section className="rounded-lg bg-white p-6 shadow-sm" aria-busy="true">
        <div className="flex items-center gap-3">
          <LuClock className="text-2xl text-yellow-600" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-slate-800">Pending invitations</h2>
        </div>
        <p className="mt-4 text-sm text-slate-600">Loading invitations…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">Unable to load invitations</h2>
        <p className="mt-2 text-sm text-red-700">
          {error?.data?.message || 'Please try again.'}
        </p>
        <button type="button" onClick={refetch} className="btn-secondary mt-4">
          Retry
        </button>
      </section>
    );
  }

  const invitations = Array.isArray(data) ? data : [];

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <LuClock className="text-2xl text-yellow-600" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-slate-800">Pending invitations</h2>
        {invitations.length > 0 && (
          <span className="ml-auto rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
            {invitations.length}
          </span>
        )}
      </div>

      {invitations.length === 0 ? (
        <div className="py-8 text-center text-slate-500">
          <LuBuilding2 className="mx-auto mb-2 text-4xl text-slate-300" aria-hidden="true" />
          <p>No pending invitations.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {invitations.map((invitation) => (
            <article key={invitation.id} className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Workspace invitation</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Role: <span className="font-medium">{invitation.role}</span>
                  </p>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                  <p className="mt-1 text-xs text-slate-500">Accept using the secure link from your email.</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default PendingInvitations;
