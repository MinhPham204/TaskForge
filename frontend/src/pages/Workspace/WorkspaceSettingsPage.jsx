import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import DashboardLayout from '../../components/layouts/DashboardLayout.jsx';
import Avatar from '../../components/Avatar.jsx';
import {
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/PageState.jsx';
import {
  useCreateOrganizationInvitationMutation,
  useGetOrganizationInvitationsQuery,
  useGetOrganizationMembersQuery,
  useGetOrganizationSettingsQuery,
  useRevokeOrganizationInvitationMutation,
  useRevokeOrganizationMemberMutation,
  useSuspendOrganizationMemberMutation,
  useUpdateOrganizationMutation,
} from '../../services/organizationApi.js';
import {
  fetchMyOrganizations,
  selectActiveOrganizationId,
} from '../../store/authSlice.js';
import {
  apiErrorMessage,
  canManageWorkspace,
  canModifyMember,
  canRevokeMember,
  canSuspendMember,
  invitationValidationMessage,
  workspaceProfileValidationMessage,
} from '../../utils/workspaceSettings.js';

const WorkspaceSettingsPage = () => {
  const dispatch = useDispatch();
  const activeOrganizationId = useSelector(selectActiveOrganizationId);

  // Core organization settings (readable by any active member)
  const {
    data: organization,
    isLoading: isOrgLoading,
    isError: isOrgError,
    error: orgError,
    refetch: refetchOrg,
  } = useGetOrganizationSettingsQuery(activeOrganizationId, {
    skip: !activeOrganizationId,
  });

  const role = organization?.role;
  const isPrivileged = canManageWorkspace(role);

  // Governance queries are strictly skipped for regular members
  const {
    data: members = [],
    isLoading: isMembersLoading,
    isError: isMembersError,
    error: membersError,
    refetch: refetchMembers,
  } = useGetOrganizationMembersQuery(activeOrganizationId, {
    skip: !activeOrganizationId || !isPrivileged,
  });

  const {
    data: invitations = [],
    isLoading: isInvitationsLoading,
    isError: isInvitationsError,
    error: invitationsError,
    refetch: refetchInvitations,
  } = useGetOrganizationInvitationsQuery(activeOrganizationId, {
    skip: !activeOrganizationId || !isPrivileged,
  });

  // Mutations
  const [updateOrg, { isLoading: isUpdatingOrg }] = useUpdateOrganizationMutation();
  const [createInvitation, { isLoading: isInviting }] = useCreateOrganizationInvitationMutation();
  const [revokeInvitation, { isLoading: isRevokingInvitation }] = useRevokeOrganizationInvitationMutation();
  const [suspendMember, { isLoading: isSuspendingMember }] = useSuspendOrganizationMemberMutation();
  const [revokeMember, { isLoading: isRevokingMember }] = useRevokeOrganizationMemberMutation();

  // Local state for forms and feedbacks
  const [profile, setProfile] = useState({ name: '', logoUrl: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'MEMBER', expiryDays: '7' });
  const [profileFeedback, setProfileFeedback] = useState(null);
  const [memberFeedback, setMemberFeedback] = useState(null);
  const [inviteFeedback, setInviteFeedback] = useState(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    isDanger: false,
    action: null,
  });
  const [isDialogSubmitting, setIsDialogSubmitting] = useState(false);

  // Sync profile form when organization data arrives or changes
  useEffect(() => {
    if (organization) {
      setProfile({
        name: organization.name || '',
        logoUrl: organization.logoUrl || '',
      });
    }
  }, [organization]);

  // Clear feedbacks when switching workspace
  useEffect(() => {
    setProfileFeedback(null);
    setMemberFeedback(null);
    setInviteFeedback(null);
  }, [activeOrganizationId]);

  // Handler: Update Organization Profile
  const handleSubmitProfile = async (event) => {
    event.preventDefault();
    setProfileFeedback(null);

    const validation = workspaceProfileValidationMessage(profile);
    if (validation) {
      setProfileFeedback({ type: 'error', message: validation });
      return;
    }

    try {
      const payload = {
        organizationId: activeOrganizationId,
        name: profile.name.trim(),
        logoUrl: profile.logoUrl?.trim() || null,
      };
      await updateOrg(payload).unwrap();
      dispatch(fetchMyOrganizations());
      setProfileFeedback({ type: 'success', message: 'Workspace profile updated successfully.' });
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        message: apiErrorMessage(err, 'Failed to update workspace profile.'),
      });
    }
  };

  // Handler: Create Invitation
  const handleSubmitInvite = async (event) => {
    event.preventDefault();
    setInviteFeedback(null);

    const expiresAt = new Date(
      Date.now() + Number(inviteForm.expiryDays) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const payload = {
      organizationId: activeOrganizationId,
      email: inviteForm.email.trim(),
      role: inviteForm.role,
      expiresAt,
    };

    const validation = invitationValidationMessage(payload);
    if (validation) {
      setInviteFeedback({ type: 'error', message: validation });
      return;
    }

    try {
      await createInvitation(payload).unwrap();
      setInviteForm({ email: '', role: 'MEMBER', expiryDays: '7' });
      setInviteFeedback({
        type: 'success',
        message: `Invitation sent to ${payload.email}.`,
      });
    } catch (err) {
      setInviteFeedback({
        type: 'error',
        message: apiErrorMessage(err, 'Failed to send invitation.'),
      });
    }
  };

  const closeDialog = () => {
    if (isDialogSubmitting) return;
    setConfirmDialog({
      open: false,
      title: '',
      message: '',
      confirmLabel: '',
      isDanger: false,
      action: null,
    });
  };

  const handleConfirmDialog = async () => {
    if (!confirmDialog.action) return;
    setIsDialogSubmitting(true);
    try {
      await confirmDialog.action();
    } finally {
      setIsDialogSubmitting(false);
      closeDialog();
    }
  };

  const promptSuspendMember = (targetMember) => {
    setMemberFeedback(null);
    setConfirmDialog({
      open: true,
      title: 'Suspend Member Access',
      message: `Are you sure you want to suspend workspace access for ${targetMember.name} (${targetMember.email})? They will temporarily be unable to view or access this workspace.`,
      confirmLabel: 'Suspend Member',
      isDanger: true,
      action: async () => {
        try {
          await suspendMember({
            organizationId: activeOrganizationId,
            userId: targetMember.userId,
          }).unwrap();
          setMemberFeedback({
            type: 'success',
            message: `Membership suspended for ${targetMember.name}.`,
          });
        } catch (err) {
          setMemberFeedback({
            type: 'error',
            message: apiErrorMessage(err, 'Failed to suspend member.'),
          });
        }
      },
    });
  };

  const promptRevokeMember = (targetMember) => {
    setMemberFeedback(null);
    setConfirmDialog({
      open: true,
      title: 'Revoke Membership',
      message: `Are you sure you want to revoke membership for ${targetMember.name} (${targetMember.email})? They will be permanently removed from this workspace.`,
      confirmLabel: 'Revoke Member',
      isDanger: true,
      action: async () => {
        try {
          await revokeMember({
            organizationId: activeOrganizationId,
            userId: targetMember.userId,
          }).unwrap();
          setMemberFeedback({
            type: 'success',
            message: `Membership revoked for ${targetMember.name}.`,
          });
        } catch (err) {
          setMemberFeedback({
            type: 'error',
            message: apiErrorMessage(err, 'Failed to revoke member.'),
          });
        }
      },
    });
  };

  const promptRevokeInvitation = (invitation) => {
    setInviteFeedback(null);
    setConfirmDialog({
      open: true,
      title: 'Revoke Pending Invitation',
      message: `Are you sure you want to revoke the pending invitation for ${invitation.email}? The invitation link will no longer be valid.`,
      confirmLabel: 'Revoke Invitation',
      isDanger: true,
      action: async () => {
        try {
          await revokeInvitation({
            organizationId: activeOrganizationId,
            invitationId: invitation.id,
          }).unwrap();
          setInviteFeedback({
            type: 'success',
            message: `Invitation revoked for ${invitation.email}.`,
          });
        } catch (err) {
          setInviteFeedback({
            type: 'error',
            message: apiErrorMessage(err, 'Failed to revoke invitation.'),
          });
        }
      },
    });
  };

  if (isOrgLoading) {
    return (
      <DashboardLayout activeMenu="/settings/workspace">
        <div className="space-y-6 max-w-5xl">
          <LoadingState label="Loading workspace settings" />
        </div>
      </DashboardLayout>
    );
  }

  if (isOrgError) {
    return (
      <DashboardLayout activeMenu="/settings/workspace">
        <div className="space-y-6 max-w-5xl">
          <ErrorState
            title={orgError?.status === 403 ? 'Access Denied' : 'Unable to load workspace'}
            message={apiErrorMessage(orgError, 'Your workspace settings could not be loaded.')}
            onRetry={refetchOrg}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="/settings/workspace">
      <div className="space-y-6 max-w-5xl">
        <header className="border-b border-border/70 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">
                {organization?.name || 'Workspace Settings'}
              </h1>
              <p className="mt-1 text-xs text-content-muted sm:text-sm">
                Manage workspace profile, members, and access control.
              </p>
            </div>
            <RoleBadge role={role} />
          </div>
        </header>

        {/* SECTION 1: Workspace Overview / Profile */}
        <section
          className="rounded-xl border border-border bg-surface p-5 sm:p-6"
          aria-labelledby="overview-heading"
        >
          <div className="border-b border-border/60 pb-3">
            <h2 id="overview-heading" className="text-sm font-semibold text-content">
              General
            </h2>
            <p className="mt-0.5 text-xs text-content-muted">
              Workspace identity and logo details.
            </p>
          </div>

          {!isPrivileged ? (
            /* Member Read-Only View */
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar
                  src={organization?.logoUrl}
                  name={organization?.name}
                  alt={`${organization?.name || 'Workspace'} logo`}
                  className="h-12 w-12 rounded-lg border border-border"
                />
                <div>
                  <p className="text-sm font-semibold text-content">{organization?.name}</p>
                  <p className="text-xs text-content-muted">Read-only member access</p>
                </div>
              </div>
              <p className="text-xs text-content-muted">
                Workspace profile editing, member management, and invitations are restricted to Owners and Admins.
              </p>
            </div>
          ) : (
            /* Owner / Admin Profile Form */
            <form className="mt-5 space-y-4" onSubmit={handleSubmitProfile}>
              <div className="flex items-center gap-4">
                <Avatar
                  src={profile.logoUrl}
                  name={profile.name}
                  alt={`${profile.name || 'Workspace'} preview logo`}
                  className="h-12 w-12 rounded-lg border border-border"
                />
                <div>
                  <p className="text-sm font-semibold text-content">{organization?.name}</p>
                  <p className="text-xs text-content-muted">Workspace profile preview</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Workspace name" htmlFor="workspace-name">
                  <input
                    id="workspace-name"
                    name="name"
                    type="text"
                    required
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className={inputClassName}
                    placeholder="Acme Corp"
                  />
                </Field>

                <Field label="Logo URL (Optional)" htmlFor="workspace-logo-url">
                  <input
                    id="workspace-logo-url"
                    name="logoUrl"
                    type="url"
                    value={profile.logoUrl}
                    onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
                    className={inputClassName}
                    placeholder="https://example.com/logo.png"
                  />
                </Field>
              </div>

              <InlineFeedback feedback={profileFeedback} />

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isUpdatingOrg}
                  className={primaryButtonClassName}
                >
                  {isUpdatingOrg ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* SECTION 2: Member Directory (Owner/Admin only) */}
        {isPrivileged && (
          <section
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
            aria-labelledby="members-heading"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 id="members-heading" className="text-sm font-semibold text-content">
                  Members
                </h2>
                <p className="mt-0.5 text-xs text-content-muted">
                  Users with access to this workspace.
                </p>
              </div>
              {members.length > 0 && (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-content-muted">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <InlineFeedback feedback={memberFeedback} />

              {isMembersLoading && <LoadingState label="Loading members…" />}

              {isMembersError && (
                <ErrorState
                  title="Unable to load members"
                  message={apiErrorMessage(membersError, 'Failed to load workspace members.')}
                  onRetry={refetchMembers}
                />
              )}

              {!isMembersLoading && !isMembersError && members.length === 0 && (
                <EmptyState
                  title="No members"
                  description="There are currently no active members listed."
                />
              )}

              {!isMembersLoading && !isMembersError && members.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm text-content">
                    <thead className="border-b border-border bg-surface-muted/60 text-xs font-medium text-content-muted">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">Member</th>
                        <th scope="col" className="px-4 py-2.5">Role</th>
                        <th scope="col" className="px-4 py-2.5">State</th>
                        <th scope="col" className="px-4 py-2.5">Joined</th>
                        <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {members.map((member) => (
                        <tr key={member.membershipId} className="hover:bg-surface-muted/40">
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar
                                src={member.profileImageUrl}
                                name={member.name}
                                alt={member.name}
                                className="h-8 w-8 rounded-full border border-border"
                              />
                              <div>
                                <p className="text-xs font-medium text-content">{member.name}</p>
                                <p className="text-[11px] text-content-muted">{member.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <RoleBadge role={member.role} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <StateBadge state={member.state} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-content-muted">
                            {member.joinedAt
                              ? new Date(member.joinedAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                            {!canModifyMember(member) ? (
                              <span className="text-[11px] text-content-muted italic">Protected</span>
                            ) : (
                              <div className="flex items-center justify-end gap-3">
                                {canSuspendMember(member) && (
                                  <button
                                    type="button"
                                    onClick={() => promptSuspendMember(member)}
                                    disabled={isSuspendingMember}
                                    className="font-medium text-warning-content hover:underline disabled:opacity-50"
                                  >
                                    Suspend
                                  </button>
                                )}
                                {canRevokeMember(member) && (
                                  <button
                                    type="button"
                                    onClick={() => promptRevokeMember(member)}
                                    disabled={isRevokingMember}
                                    className="font-medium text-danger-content hover:underline disabled:opacity-50"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SECTION 3: Invitation Governance (Owner/Admin only) */}
        {isPrivileged && (
          <section
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
            aria-labelledby="invitations-heading"
          >
            <div className="border-b border-border/60 pb-3">
              <h2 id="invitations-heading" className="text-sm font-semibold text-content">
                Invite Members
              </h2>
              <p className="mt-0.5 text-xs text-content-muted">
                Send an invitation to join this workspace.
              </p>
            </div>

            {/* Invite Form */}
            <form className="mt-5 space-y-4" onSubmit={handleSubmitInvite}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Email address" htmlFor="invite-email">
                  <input
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className={inputClassName}
                    placeholder="user@example.com"
                  />
                </Field>

                <Field label="Role" htmlFor="invite-role">
                  <select
                    id="invite-role"
                    name="role"
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className={inputClassName}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </Field>

                <Field label="Expires in" htmlFor="invite-expiry">
                  <select
                    id="invite-expiry"
                    name="expiryDays"
                    value={inviteForm.expiryDays}
                    onChange={(e) => setInviteForm({ ...inviteForm, expiryDays: e.target.value })}
                    className={inputClassName}
                  >
                    <option value="7">7 Days</option>
                    <option value="14">14 Days</option>
                    <option value="30">30 Days</option>
                  </select>
                </Field>
              </div>

              <InlineFeedback feedback={inviteFeedback} />

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isInviting}
                  className={primaryButtonClassName}
                >
                  {isInviting ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </form>

            {/* Pending Invitations List */}
            <div className="mt-8 border-t border-border/60 pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                Pending Invitations
              </h3>

              <div className="mt-3">
                {isInvitationsLoading && <LoadingState label="Loading invitations…" />}

                {isInvitationsError && (
                  <ErrorState
                    title="Unable to load invitations"
                    message={apiErrorMessage(invitationsError, 'Failed to load pending invitations.')}
                    onRetry={refetchInvitations}
                  />
                )}

                {!isInvitationsLoading && !isInvitationsError && invitations.length === 0 && (
                  <p className="py-2 text-xs text-content-muted">No pending invitations.</p>
                )}

                {!isInvitationsLoading && !isInvitationsError && invitations.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm text-content">
                      <thead className="border-b border-border bg-surface-muted/60 text-xs font-medium text-content-muted">
                        <tr>
                          <th scope="col" className="px-4 py-2.5">Email</th>
                          <th scope="col" className="px-4 py-2.5">Role</th>
                          <th scope="col" className="px-4 py-2.5">Status</th>
                          <th scope="col" className="px-4 py-2.5">Expires</th>
                          <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {invitations.map((inv) => (
                          <tr key={inv.id} className="hover:bg-surface-muted/40">
                            <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-content">
                              {inv.email}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <RoleBadge role={inv.role} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                {inv.state}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-content-muted">
                              {inv.expiresAt
                                ? new Date(inv.expiresAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                              <button
                                type="button"
                                onClick={() => promptRevokeInvitation(inv)}
                                disabled={isRevokingInvitation}
                                className="font-medium text-danger-content hover:underline disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Accessible Confirmation Dialog */}
        <Dialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          onClose={closeDialog}
          actions={
            <>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isDialogSubmitting}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDialog}
                disabled={isDialogSubmitting}
                className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                  confirmDialog.isDanger
                    ? 'bg-danger-content hover:opacity-90'
                    : 'bg-primary hover:bg-blue-700'
                }`}
              >
                {isDialogSubmitting ? 'Processing…' : confirmDialog.confirmLabel}
              </button>
            </>
          }
        >
          <p className="text-xs text-content-muted">{confirmDialog.message}</p>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

// UI helper components
const Field = ({ label, htmlFor, children }) => (
  <div>
    <label htmlFor={htmlFor} className="text-xs font-medium text-content">
      {label}
    </label>
    <div className="mt-1.5">{children}</div>
  </div>
);

const RoleBadge = ({ role }) => {
  if (role === 'OWNER') {
    return (
      <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        Owner
      </span>
    );
  }
  if (role === 'ADMIN') {
    return (
      <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-800 dark:bg-blue-950 dark:text-blue-300">
        Admin
      </span>
    );
  }
  return (
    <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
      Member
    </span>
  );
};

const StateBadge = ({ state }) => {
  if (state === 'ACTIVE') {
    return (
      <span className="rounded bg-success-surface px-1.5 py-0.5 text-[11px] font-medium text-success-content">
        Active
      </span>
    );
  }
  if (state === 'SUSPENDED') {
    return (
      <span className="rounded bg-warning-surface px-1.5 py-0.5 text-[11px] font-medium text-warning-content">
        Suspended
      </span>
    );
  }
  if (state === 'REVOKED') {
    return (
      <span className="rounded bg-danger-surface px-1.5 py-0.5 text-[11px] font-medium text-danger-content">
        Revoked
      </span>
    );
  }
  return (
    <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-content-muted">
      {state || 'Unknown'}
    </span>
  );
};

const InlineFeedback = ({ feedback }) => {
  if (!feedback) return null;
  const isSuccess = feedback.type === 'success';
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
        isSuccess
          ? 'border-success-content/30 bg-success-surface text-success-content'
          : 'border-danger-border bg-danger-surface text-danger-content'
      }`}
      role={isSuccess ? 'status' : 'alert'}
      aria-live="polite"
    >
      {feedback.message}
    </p>
  );
};

const inputClassName =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content shadow-xs focus:border-primary focus:outline-hidden';
const primaryButtonClassName =
  'inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60';

export default WorkspaceSettingsPage;
