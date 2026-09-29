import React from 'react';
import { LuBuilding2, LuClock } from 'react-icons/lu';
import { useGetPendingInvitationsQuery } from '../services/organizationApi';

const PendingInvitations = () => {
  const { data = [], isLoading, isError, error, refetch } =
    useGetPendingInvitationsQuery();

  if (isLoading) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6 shadow-xs" aria-busy="true">
        <div className="flex items-center gap-3">
          <LuClock className="text-2xl text-warning-content" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-content">Pending invitations</h2>
        </div>
        <p className="mt-4 text-sm text-content-muted">Loading invitations…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded-xl border border-danger-border bg-danger-surface p-6">
        <h2 className="text-lg font-semibold text-danger-content">Unable to load invitations</h2>
        <p className="mt-2 text-sm text-danger-content/90">
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
    <section className="rounded-xl border border-border bg-surface p-6 shadow-xs">
      <div className="flex items-center gap-3">
        <LuClock className="text-2xl text-warning-content" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-content">Pending invitations</h2>
        {invitations.length > 0 && (
          <span className="ml-auto rounded-full bg-warning-surface border border-warning-border px-3 py-1 text-xs font-semibold text-warning-content">
            {invitations.length}
          </span>
        )}
      </div>

      {invitations.length === 0 ? (
        <div className="py-8 text-center text-content-muted">
          <LuBuilding2 className="mx-auto mb-2 text-4xl text-content-muted/60" aria-hidden="true" />
          <p>No pending invitations.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {invitations.map((invitation) => (
            <article key={invitation.id} className="rounded-lg border border-warning-border bg-warning-surface p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-content">Workspace invitation</h3>
                  <p className="mt-1 text-sm text-content-muted">
                    Role: <span className="font-medium text-content">{invitation.role}</span>
                  </p>
                </div>
                <div className="text-sm text-content-muted sm:text-right">
                  <p>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                  <p className="mt-1 text-xs text-content-muted/80">Accept using the secure link from your email.</p>
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
