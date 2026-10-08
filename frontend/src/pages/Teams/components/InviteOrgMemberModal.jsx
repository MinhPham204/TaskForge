import React, { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../../components/common/Modal';
import { useCreateOrganizationInvitationMutation, useGetInvitationRolesQuery } from '../../../services/organizationApi';
import useUserAuth from '../../../hooks/useUserAuth.jsx';
import { invitableOrganizationRoles } from '../../../utils/organizationPermissions.js';
import { invitationValidationMessage } from '../../../utils/workspaceSettings';

const InviteOrgMemberModal = ({ isOpen, onClose, organizationId }) => {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const { capabilities, hasPermission } = useUserAuth();
  const canInvite = hasPermission('org.members.invite');
  const { currentData: roleData, isFetching: isLoadingRoles, error: rolesError } = useGetInvitationRolesQuery(organizationId, {
    skip: !isOpen || !organizationId || !canInvite,
  });
  const roles = invitableOrganizationRoles(roleData, capabilities);
  React.useEffect(() => {
    setEmail('');
    setRoleId('');
    setError('');
  }, [organizationId, canInvite]);
  const [expiryDays, setExpiryDays] = useState('7');
  const [error, setError] = useState('');

  const [createInvitation, { isLoading }] = useCreateOrganizationInvitationMutation();

  const handleClose = () => {
    if (isLoading) return;
    setError('');
    setEmail('');
    setRoleId('');
    setExpiryDays('7');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canInvite) return;
    setError('');
    const invitedRole = roles.find((role) => role.id === roleId) ||
      (!roleId ? roles.find((role) => role.systemCode === 'MEMBER') : null);
    if (!invitedRole) {
      setError('Select an available invitation role.');
      return;
    }

    const trimmedEmail = email.trim();
    const expiresAt = new Date(
      Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000
    ).toISOString();

    const payload = {
      organizationId,
      email: trimmedEmail,
      roleId: invitedRole.id,
      expiresAt,
    };

    const validation = invitationValidationMessage(payload);
    if (validation) {
      setError(validation);
      return;
    }

    try {
      await createInvitation(payload).unwrap();
      toast.success(`Invitation sent to ${trimmedEmail}`);
      handleClose();
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to send invitation');
    }
  };

  return (
    <Modal isOpen={isOpen && canInvite} onClose={handleClose} title="Invite Organization Member">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="invite-email" className="block text-xs font-semibold text-content mb-1">
            Email Address <span className="text-rose-500">*</span>
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-lg text-content focus:outline-none focus:border-primary placeholder:text-content-muted"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="invite-role" className="block text-xs font-semibold text-content mb-1">
              Role
            </label>
            <select
              id="invite-role"
              value={roleId || roles.find((role) => role.systemCode === 'MEMBER')?.id || ''}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={isLoadingRoles}
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-lg text-content focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="" disabled>Select a role</option>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="invite-expiry" className="block text-xs font-semibold text-content mb-1">
              Expires In
            </label>
            <select
              id="invite-expiry"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-lg text-content focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="1">24 hours</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
        </div>

        <p className="text-[11px] text-content-muted">
          An invitation link will be sent to the email address above to join your organization workspace.
        </p>
        {rolesError && <p role="alert" className="text-xs text-danger-content">Unable to load invitation roles.</p>}

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="px-3.5 py-2 text-xs font-medium text-content-muted hover:text-content border border-border rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !email.trim() || isLoadingRoles || !roles.length}
            className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-blue-600 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send Invitation'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default InviteOrgMemberModal;
