export const canManageWorkspace = (role) => {
  return role === 'OWNER' || role === 'ADMIN';
};

export const canModifyMember = (targetMember) => {
  if (!targetMember) return false;
  return targetMember.role !== 'OWNER';
};

export const canSuspendMember = (targetMember) => {
  if (!canModifyMember(targetMember)) return false;
  return targetMember.state === 'ACTIVE';
};

export const canRevokeMember = (targetMember) => {
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
  if (input?.role && input.role !== 'ADMIN' && input.role !== 'MEMBER') {
    return 'Invitation role must be ADMIN or MEMBER.';
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
