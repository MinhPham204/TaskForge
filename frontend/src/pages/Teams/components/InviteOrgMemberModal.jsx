import React, { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../../components/common/Modal';
import { useCreateOrganizationInvitationMutation } from '../../../services/organizationApi';
import { invitationValidationMessage } from '../../../utils/workspaceSettings';

const InviteOrgMemberModal = ({ isOpen, onClose, organizationId }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [expiryDays, setExpiryDays] = useState('7');
  const [error, setError] = useState('');

  const [createInvitation, { isLoading }] = useCreateOrganizationInvitationMutation();

  const handleClose = () => {
    if (isLoading) return;
    setError('');
    setEmail('');
    setRole('MEMBER');
    setExpiryDays('7');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    const expiresAt = new Date(
      Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000
    ).toISOString();

    const payload = {
      organizationId,
      email: trimmedEmail,
      role,
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Invite Organization Member">
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
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-lg text-content focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
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
            disabled={isLoading || !email.trim()}
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
