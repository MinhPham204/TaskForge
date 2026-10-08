import { hasOrganizationPermission } from './organizationPermissions.js';

export const canManageWorkspace = (capabilities) => {
  return hasOrganizationPermission(capabilities, 'org.settings.update');
};

export const canModifyMember = (targetMember) => {
  if (!targetMember) return false;
  return targetMember.isOwner === false;
};

export const canSuspendMember = (targetMember, capabilities) => {
  if (!hasOrganizationPermission(capabilities, 'org.members.suspend')) return false;
  if (!canModifyMember(targetMember)) return false;
  return targetMember.state === 'ACTIVE';
};

export const canRevokeMember = (targetMember, capabilities) => {
  if (!hasOrganizationPermission(capabilities, 'org.members.revoke')) return false;
  if (!canModifyMember(targetMember)) return false;
  return targetMember.state !== 'REVOKED';
};

export const workspaceProfileValidationMessage = (profile) => {
  const name = profile?.name?.trim();
  if (!name) {
    return 'Workspace name is required.';
  }
  return null;
};

export const invitationValidationMessage = (input) => {
  const email = input?.email?.trim();
  if (!email) {
    return 'Recipient email is required.';
  }
  // Standard simple email regex
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Enter a valid email address.';
  }
  if (!input?.expiresAt || new Date(input.expiresAt).getTime() <= Date.now()) {
    return 'Invitation expiry must be in the future.';
  }
  if (input?.roleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.roleId)) {
    return 'Invitation role must be a valid UUID.';
  }
  return null;
};

export const apiErrorMessage = (error, fallback = 'An unexpected error occurred.') => {
  if (!error) return fallback;
  if (typeof error?.data?.message === 'string') {
    return error.data.message;
  }
  if (Array.isArray(error?.data?.message)) {
    return error.data.message.filter(Boolean).join(', ');
  }
  if (typeof error?.message === 'string') {
    return error.message;
  }
  return fallback;
};
