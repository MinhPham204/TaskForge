import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import DashboardLayout from '../../components/layouts/DashboardLayout.jsx';
import Avatar from '../../components/Avatar.jsx';
import {
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/PageState.jsx';
import {
  LuLock,
  LuCopy,
  LuCheck,
  LuUserPlus,
  LuLogOut,
  LuUsers,
  LuShieldCheck,
  LuCreditCard,
  LuWebhook,
  LuInfo,
} from 'react-icons/lu';
import {
  useCreateOrganizationInvitationMutation,
  useGetOrganizationInvitationsQuery,
  useGetOrganizationMembersQuery,
  useGetOrganizationSettingsQuery,
  useRevokeOrganizationInvitationMutation,
  useRevokeOrganizationMemberMutation,
  useSuspendOrganizationMemberMutation,
  useUpdateOrganizationMutation,
  useLeaveOrganizationMutation,
} from '../../services/organizationApi.js';
import { useGetDashboardQuery } from '../../services/dashboardApi.js';
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
  const navigate = useNavigate();
  const activeOrganizationId = useSelector(selectActiveOrganizationId);

  // Active tab state
  const [activeTab, setActiveTab] = useState('general');

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

  // Query dashboard for project metrics
  const { data: dashboardData } = useGetDashboardQuery(undefined, {
    skip: !activeOrganizationId,
  });
  const projectsCount =
    dashboardData?.portfolioSummary?.activeProjects ||
    dashboardData?.recentProjects?.length ||
    4;

  // Mutations
  const [updateOrg, { isLoading: isUpdatingOrg }] = useUpdateOrganizationMutation();
  const [createInvitation, { isLoading: isInviting }] = useCreateOrganizationInvitationMutation();
  const [revokeInvitation, { isLoading: isRevokingInvitation }] = useRevokeOrganizationInvitationMutation();
  const [suspendMember, { isLoading: isSuspendingMember }] = useSuspendOrganizationMemberMutation();
  const [revokeMember, { isLoading: isRevokingMember }] = useRevokeOrganizationMemberMutation();
  const [leaveOrg, { isLoading: isLeavingOrg }] = useLeaveOrganizationMutation();

  // Local state for forms and feedbacks
  const [profile, setProfile] = useState({
    name: '',
    logoUrl: '',
    slug: '',
    description: '',
  });
  const [showLogoInput, setShowLogoInput] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);
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
      const generatedSlug = (organization.name || 'workspace')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      setProfile({
        name: organization.name || '',
        logoUrl: organization.logoUrl || '',
        slug: generatedSlug || 'workspace',
        description:
          organization.description ||
          'Primary collaboration and engineering hub for core platform and client apps.',
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
      setShowLogoInput(false);
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        message: apiErrorMessage(err, 'Failed to update workspace profile.'),
      });
    }
  };

  // Handler: Copy Workspace Slug/URL
  const handleCopyUrl = () => {
    const fullUrl = `${window.location.origin}/${profile.slug}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(fullUrl);
      setCopiedSlug(true);
      setTimeout(() => setCopiedSlug(false), 2000);
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

  // Handler: Prompt Leave Workspace
  const promptLeaveWorkspace = () => {
    if (role === 'OWNER') {
      setConfirmDialog({
        open: true,
        title: 'Ownership Protection',
        message:
          'As the Workspace Owner, you cannot leave this workspace directly. Please transfer ownership to another Administrator before leaving.',
        confirmLabel: 'Understand',
        isDanger: false,
        action: async () => {},
      });
      return;
    }

    setConfirmDialog({
      open: true,
      title: 'Leave Workspace',
      message: `Are you sure you want to leave ${
        organization?.name || 'this workspace'
      }? You will immediately lose access to all tasks, project roadmaps, and private channels. You will need an invite link from an administrator to rejoin.`,
      confirmLabel: isLeavingOrg ? 'Leaving…' : 'Leave Workspace',
      isDanger: true,
      action: async () => {
        try {
          await leaveOrg(activeOrganizationId).unwrap();
          const refreshed = await dispatch(fetchMyOrganizations()).unwrap();
          if (refreshed && refreshed.length > 0) {
            navigate('/dashboard');
          } else {
            navigate('/workspace/onboarding');
          }
        } catch (err) {
          setProfileFeedback({
            type: 'error',
            message: apiErrorMessage(err, 'Failed to leave workspace.'),
          });
        }
      },
    });
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
        <div className="space-y-5 pb-12 select-none">
          <LoadingState label="Loading workspace settings" />
        </div>
      </DashboardLayout>
    );
  }

  if (isOrgError) {
    return (
      <DashboardLayout activeMenu="/settings/workspace">
        <div className="space-y-5 pb-12 select-none">
          <ErrorState
            title={orgError?.status === 403 ? 'Access Denied' : 'Unable to load workspace'}
            message={apiErrorMessage(orgError, 'Your workspace settings could not be loaded.')}
            onRetry={refetchOrg}
          />
        </div>
      </DashboardLayout>
    );
  }

  const memberCount = members.length > 0 ? members.length : 48;
  const memberPercentage = Math.min(Math.round((memberCount / 100) * 100), 100);
  const initials = organization?.name
    ? organization.name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'WS';

  return (
    <DashboardLayout activeMenu="/settings/workspace">
      <div className="space-y-5 pb-12 select-none">
        {/* Breadcrumb matching other pages */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-1 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2 text-xs text-content-muted mb-1">
              <Link to="/dashboard" className="hover:text-content transition-colors">
                TaskForge
              </Link>
              <span>/</span>
              <span>{organization?.name || 'Workspace'}</span>
              <span>/</span>
              <span className="text-content font-medium">Workspace Settings</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-content">
                {organization?.name || 'Workspace Settings'}
              </h1>
              <RoleBadge role={role} />
            </div>
            <p className="mt-1 text-xs sm:text-sm text-content-muted">
              Manage workspace profile, members, and access control.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={promptLeaveWorkspace}
              disabled={isLeavingOrg}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-muted bg-surface border border-border rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <LuLogOut className="w-3.5 h-3.5 text-content-muted" />
              <span>Leave Workspace</span>
            </button>

            {isPrivileged ? (
              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <LuUserPlus className="w-3.5 h-3.5" />
                <span>Invite Member</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                title="Admin privileges required"
                className="px-3 py-1.5 text-xs font-medium text-content-muted bg-surface-muted border border-border/80 rounded-lg cursor-not-allowed flex items-center gap-1.5 opacity-80"
              >
                <LuLock className="w-3.5 h-3.5 text-content-muted" />
                <span>Invite Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabbed Navigation */}
        <div className="border-b border-border">
          <nav aria-label="Tabs" className="-mb-px flex space-x-6 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`pb-2.5 text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'general'
                  ? 'border-content text-content'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              General
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'members'
                  ? 'border-content font-semibold text-content'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              <span>Members &amp; Access</span>
              {isPrivileged && members.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.2 bg-surface-muted text-content-muted rounded-full font-medium">
                  {members.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'roles'
                  ? 'border-content font-semibold text-content'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Roles &amp; Permissions
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('billing')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'billing'
                  ? 'border-content font-semibold text-content'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Billing &amp; Plans
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('integrations')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'integrations'
                  ? 'border-content font-semibold text-content'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Integrations &amp; Webhooks
            </button>
          </nav>
        </div>

        {/* TAB 1: GENERAL */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Notification Banner: Role Permission Notice (shown when read-only member) */}
            {!isPrivileged && (
              <div className="flex items-start gap-3 p-3.5 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-900 dark:text-blue-200">
                <LuInfo className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold text-blue-950 dark:text-blue-100">
                    Read-only Member Access:
                  </span>{' '}
                  Workspace profile editing, member management, and invitations are restricted to Owners and Admins.
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('roles')}
                  className="text-primary hover:underline font-semibold shrink-0 cursor-pointer"
                >
                  Learn more
                </button>
              </div>
            )}

            {/* CARD 1: Workspace Identity & Profile */}
            <section
              className="bg-surface rounded-xl border border-border shadow-xs overflow-hidden"
              data-purpose="workspace-identity-card"
            >
              <div className="p-6 border-b border-border/60">
                <h2 className="text-base font-semibold text-content">General Information</h2>
                <p className="text-xs text-content-muted mt-0.5">
                  Workspace identity, public metadata, and logo details.
                </p>
              </div>

              <form onSubmit={handleSubmitProfile} className="p-6 space-y-6">
                {/* Workspace Logo Row */}
                <div className="flex items-center gap-5">
                  {profile.logoUrl ? (
                    <img
                      src={profile.logoUrl}
                      alt={profile.name}
                      className="w-16 h-16 rounded-xl object-cover border border-border shadow-inner shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-surface-muted to-border/40 border border-border flex items-center justify-center text-content font-bold text-xl shadow-inner shrink-0">
                      {initials}
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-content">Workspace Icon</h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      Recommended format: Square SVG, PNG or JPEG (min 256x256px).
                    </p>

                    <div className="mt-2.5 flex items-center gap-2">
                      {isPrivileged ? (
                        <button
                          type="button"
                          onClick={() => setShowLogoInput(!showLogoInput)}
                          className="px-2.5 py-1 text-xs font-medium text-content bg-surface-muted hover:bg-border/60 border border-border rounded-md transition-colors cursor-pointer"
                        >
                          Change Logo
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled
                            className="px-2.5 py-1 text-xs font-medium text-content-muted bg-surface-muted border border-border rounded-md cursor-not-allowed"
                          >
                            Change Logo
                          </button>
                          <span className="text-[11px] text-content-muted">Locked for members</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Optional Logo URL input field when admin chooses to change logo */}
                {isPrivileged && showLogoInput && (
                  <div className="p-3 bg-surface-muted rounded-lg border border-border space-y-2">
                    <label
                      htmlFor="logo-url-input"
                      className="block text-xs font-medium text-content"
                    >
                      Image / Logo URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="logo-url-input"
                        type="url"
                        placeholder="https://example.com/logo.png"
                        value={profile.logoUrl}
                        onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLogoInput(false)}
                        className="px-3 py-1.5 text-xs text-content-muted hover:text-content border border-border rounded-md cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  {/* Workspace Name */}
                  <div>
                    <label
                      className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5"
                      htmlFor="workspace-name"
                    >
                      Workspace Name
                    </label>
                    <div className="relative">
                      <input
                        id="workspace-name"
                        type="text"
                        required
                        readOnly={!isPrivileged}
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className={`block w-full text-sm rounded-lg py-2 px-3 shadow-2xs border ${
                          !isPrivileged
                            ? 'bg-surface-muted border-border text-content-muted cursor-not-allowed focus:ring-0 focus:border-border'
                            : 'bg-surface border-border text-content focus:border-primary focus:outline-hidden'
                        }`}
                      />
                      {!isPrivileged && (
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-muted">
                          <LuLock className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Workspace Slug & URL */}
                  <div>
                    <label
                      className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5"
                      htmlFor="workspace-slug"
                    >
                      Workspace Slug &amp; URL
                    </label>
                    <div className="flex rounded-lg shadow-2xs">
                      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-border bg-surface-muted text-content-muted text-xs">
                        taskforge.dev/
                      </span>
                      <input
                        id="workspace-slug"
                        type="text"
                        readOnly
                        value={profile.slug}
                        className="flex-1 min-w-0 block w-full px-3 py-2 text-sm bg-surface-muted border-border text-content-muted cursor-not-allowed focus:ring-0 focus:border-border"
                      />
                      <button
                        type="button"
                        onClick={handleCopyUrl}
                        title="Copy to clipboard"
                        className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-border bg-surface hover:bg-surface-muted text-content text-xs font-medium transition-colors cursor-pointer"
                      >
                        {copiedSlug ? (
                          <>
                            <LuCheck className="w-3.5 h-3.5 mr-1 text-success-content" />
                            <span className="text-success-content">Copied!</span>
                          </>
                        ) : (
                          <>
                            <LuCopy className="w-3.5 h-3.5 mr-1 text-content-muted" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Workspace Description */}
                <div>
                  <label
                    className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5"
                    htmlFor="workspace-desc"
                  >
                    Description
                  </label>
                  <textarea
                    id="workspace-desc"
                    rows={2}
                    readOnly={!isPrivileged}
                    value={profile.description}
                    onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                    className={`block w-full text-sm rounded-lg py-2 px-3 shadow-2xs border ${
                      !isPrivileged
                        ? 'bg-surface-muted border-border text-content-muted cursor-not-allowed focus:ring-0 focus:border-border'
                        : 'bg-surface border-border text-content focus:border-primary focus:outline-hidden'
                    }`}
                  />
                </div>

                <InlineFeedback feedback={profileFeedback} />

                {/* Card Footer Actions */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                  {!isPrivileged ? (
                    <>
                      <span className="text-content-muted">
                        Need changes to workspace identity? Contact your workspace owner.
                      </span>
                      <button
                        type="button"
                        disabled
                        className="px-3 py-1.5 text-xs font-medium text-content-muted bg-surface-muted rounded-md cursor-not-allowed border border-border/60"
                      >
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-content-muted">
                        Modifications are visible across all workspace members.
                      </span>
                      <button
                        type="submit"
                        disabled={isUpdatingOrg}
                        className={primaryButtonClassName}
                      >
                        {isUpdatingOrg ? 'Saving…' : 'Save Changes'}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </section>

            {/* CARD 2: Workspace Overview & Quick Metrics */}
            <section
              className="bg-surface rounded-xl border border-border shadow-xs p-6"
              data-purpose="workspace-stats-card"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-content">Plan &amp; Usage Overview</h2>
                  <p className="text-xs text-content-muted mt-0.5">
                    High-level capacity allocation and current subscription state.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Enterprise Tier
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                {/* Metric 1 */}
                <div className="p-4 rounded-lg bg-surface-muted border border-border">
                  <div className="text-xs font-medium text-content-muted">Total Members</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-content">{memberCount}</span>
                    <span className="text-xs text-content-muted">/ 100 seats</span>
                  </div>
                  <div className="w-full bg-border h-1.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className="bg-slate-700 dark:bg-slate-300 h-1.5 rounded-full"
                      style={{ width: `${memberPercentage}%` }}
                    ></div>
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="p-4 rounded-lg bg-surface-muted border border-border">
                  <div className="text-xs font-medium text-content-muted">Active Projects</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-content">{projectsCount}</span>
                    <span className="text-xs text-content-muted">active projects</span>
                  </div>
                  <div className="w-full bg-border h-1.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full"
                      style={{ width: `${Math.min(projectsCount * 10, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="p-4 rounded-lg bg-surface-muted border border-border">
                  <div className="text-xs font-medium text-content-muted">Storage Used</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-content">12.4 GB</span>
                    <span className="text-xs text-content-muted">of 50 GB</span>
                  </div>
                  <div className="w-full bg-border h-1.5 rounded-full mt-3 overflow-hidden">
                    <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: '24.8%' }}></div>
                  </div>
                </div>
              </div>
            </section>

            {/* CARD 3: Danger Zone / Member Exit Action */}
            <section
              className="bg-surface rounded-xl border border-danger-border shadow-xs overflow-hidden"
              data-purpose="workspace-danger-zone"
            >
              <div className="p-6">
                <h2 className="text-base font-semibold text-danger-content">Leave Workspace</h2>
                <p className="text-xs text-content-muted mt-1 max-w-2xl">
                  You will lose access to all tasks, project roadmaps, and private team channels in{' '}
                  <strong className="text-content">{organization?.name}</strong>. You will need an invite
                  link from an administrator to rejoin.
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={promptLeaveWorkspace}
                    disabled={isLeavingOrg}
                    className="px-3.5 py-2 text-xs font-medium text-danger-content hover:bg-danger-surface/80 bg-danger-surface border border-danger-border rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Leave {organization?.name || 'Workspace'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: MEMBERS & ACCESS */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {!isPrivileged ? (
              <section className="bg-surface rounded-xl border border-border p-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-surface-muted flex items-center justify-center text-content-muted mb-3">
                  <LuUsers className="w-6 h-6" />
                </div>
                <h2 className="text-base font-semibold text-content">Member Directory</h2>
                <p className="text-xs text-content-muted mt-1 max-w-md mx-auto">
                  Workspace members and invitation governance are managed by Owners and Admins.
                  Contact an administrator if you need to adjust roles or invite collaborators.
                </p>
              </section>
            ) : (
              <>
                {/* Invitation Section */}
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
                          onChange={(e) =>
                            setInviteForm({ ...inviteForm, email: e.target.value })
                          }
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
                          onChange={(e) =>
                            setInviteForm({ ...inviteForm, expiryDays: e.target.value })
                          }
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
                          message={apiErrorMessage(
                            invitationsError,
                            'Failed to load pending invitations.',
                          )}
                          onRetry={refetchInvitations}
                        />
                      )}

                      {!isInvitationsLoading &&
                        !isInvitationsError &&
                        invitations.length === 0 && (
                          <p className="py-2 text-xs text-content-muted">No pending invitations.</p>
                        )}

                      {!isInvitationsLoading && !isInvitationsError && invitations.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-left text-sm text-content">
                            <thead className="border-b border-border bg-surface-muted text-xs font-medium text-content-muted">
                              <tr>
                                <th scope="col" className="px-4 py-2.5">
                                  Email
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                  Role
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                  Status
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                  Expires
                                </th>
                                <th scope="col" className="px-4 py-2.5 text-right">
                                  Actions
                                </th>
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
                                      className="font-medium text-danger-content hover:underline disabled:opacity-50 cursor-pointer"
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

                {/* Member Directory */}
                <section
                  className="rounded-xl border border-border bg-surface p-5 sm:p-6"
                  aria-labelledby="members-heading"
                >
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div>
                      <h2 id="members-heading" className="text-sm font-semibold text-content">
                        Members Directory
                      </h2>
                      <p className="mt-0.5 text-xs text-content-muted">
                        Active accounts with access to this workspace.
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
                          <thead className="border-b border-border bg-surface-muted text-xs font-medium text-content-muted">
                            <tr>
                              <th scope="col" className="px-4 py-2.5">
                                Member
                              </th>
                              <th scope="col" className="px-4 py-2.5">
                                Role
                              </th>
                              <th scope="col" className="px-4 py-2.5">
                                State
                              </th>
                              <th scope="col" className="px-4 py-2.5">
                                Joined
                              </th>
                              <th scope="col" className="px-4 py-2.5 text-right">
                                Actions
                              </th>
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
                                      <p className="text-xs font-medium text-content">
                                        {member.name}
                                      </p>
                                      <p className="text-[11px] text-content-muted">
                                        {member.email}
                                      </p>
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
                                    <span className="text-[11px] text-content-muted italic">
                                      Protected
                                    </span>
                                  ) : (
                                    <div className="flex items-center justify-end gap-3">
                                      {canSuspendMember(member) && (
                                        <button
                                          type="button"
                                          onClick={() => promptSuspendMember(member)}
                                          disabled={isSuspendingMember}
                                          className="font-medium text-warning-content hover:underline disabled:opacity-50 cursor-pointer"
                                        >
                                          Suspend
                                        </button>
                                      )}
                                      {canRevokeMember(member) && (
                                        <button
                                          type="button"
                                          onClick={() => promptRevokeMember(member)}
                                          disabled={isRevokingMember}
                                          className="font-medium text-danger-content hover:underline disabled:opacity-50 cursor-pointer"
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
              </>
            )}
          </div>
        )}

        {/* TAB 3: ROLES & PERMISSIONS */}
        {activeTab === 'roles' && (
          <section className="bg-surface rounded-xl border border-border p-6 space-y-6">
            <div className="border-b border-border/60 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-content">Roles &amp; Permissions</h2>
                  <p className="text-xs text-content-muted mt-0.5">
                    Workspace role hierarchy and capabilities matrix.
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                  Built-in RBAC
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-border bg-surface-muted space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-content uppercase tracking-wider">Owner</span>
                  <RoleBadge role="OWNER" />
                </div>
                <p className="text-xs text-content-muted">
                  Full control over workspace profile, member governance, role assignments, and workspace transfer.
                </p>
                <ul className="text-xs space-y-1 text-content-muted list-disc list-inside pt-1">
                  <li>Transfer workspace ownership</li>
                  <li>Update workspace branding</li>
                  <li>Invite and revoke admins</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg border border-border bg-surface-muted space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-content uppercase tracking-wider">Admin</span>
                  <RoleBadge role="ADMIN" />
                </div>
                <p className="text-xs text-content-muted">
                  Can invite new members, suspend or remove active members, and configure team projects.
                </p>
                <ul className="text-xs space-y-1 text-content-muted list-disc list-inside pt-1">
                  <li>Send invitations</li>
                  <li>Manage member access</li>
                  <li>Manage projects &amp; teams</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg border border-border bg-surface-muted space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-content uppercase tracking-wider">Member</span>
                  <RoleBadge role="MEMBER" />
                </div>
                <p className="text-xs text-content-muted">
                  Can participate in assigned projects, update tasks, collaborate in discussions, and view workspace info.
                </p>
                <ul className="text-xs space-y-1 text-content-muted list-disc list-inside pt-1">
                  <li>Execute and assign tasks</li>
                  <li>Join project discussions</li>
                  <li>Leave workspace when needed</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: BILLING & PLANS */}
        {activeTab === 'billing' && (
          <section className="bg-surface rounded-xl border border-border p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="text-base font-semibold text-content">Billing &amp; Plans</h2>
                <p className="text-xs text-content-muted mt-0.5">
                  Subscription plan details, seats quota, and payment history.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active Plan
              </span>
            </div>

            <div className="p-5 rounded-xl border border-border bg-surface-muted flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-content">Enterprise Tier</h3>
                <p className="text-xs text-content-muted mt-1">
                  Unlimited projects, advanced RBAC, 100 seats quota, and priority SLAs.
                </p>
              </div>
              <button
                type="button"
                className="px-3.5 py-2 text-xs font-medium text-white bg-primary hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
              >
                Manage Subscription
              </button>
            </div>
          </section>
        )}

        {/* TAB 5: INTEGRATIONS & WEBHOOKS */}
        {activeTab === 'integrations' && (
          <section className="bg-surface rounded-xl border border-border p-6 space-y-6">
            <div className="border-b border-border/60 pb-3">
              <h2 className="text-base font-semibold text-content">Integrations &amp; Webhooks</h2>
              <p className="text-xs text-content-muted mt-0.5">
                Connect external developer tools and notification pipelines.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border bg-surface-muted flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface border border-border">
                  <LuWebhook className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-content">Outbox &amp; Webhooks</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-content-muted">
                      Ready
                    </span>
                  </div>
                  <p className="text-xs text-content-muted mt-1">
                    Automated background delivery for task transitions and member lifecycle events.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-border bg-surface-muted flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface border border-border">
                  <LuShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-content">Audit Log Pipeline</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-content-muted">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-content-muted mt-1">
                    PostgreSQL transactional audit trail tracking all governance operations.
                  </p>
                </div>
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
                className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-muted disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDialog}
                disabled={isDialogSubmitting}
                className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 cursor-pointer ${
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
    <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-content-muted border border-border/60">
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
  'inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer';

export default WorkspaceSettingsPage;
