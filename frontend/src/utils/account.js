export const profileUpdatePayload = ({ name, profileImageUrl }) => ({
  name: String(name || '').trim(),
  profileImageUrl: String(profileImageUrl || '').trim() || null,
});

export const profileValidationMessage = (profile) => {
  if (!profile.name) return 'Enter your name.';
  if (profile.name.length > 120) return 'Your name must be 120 characters or fewer.';
  return null;
};

export const passwordValidationMessage = ({
  currentPassword,
  newPassword,
  confirmPassword,
}) => {
  if (!currentPassword) return 'Enter your current password.';
  if (newPassword.length < 8 || newPassword.length > 128) {
    return 'Your new password must be between 8 and 128 characters.';
  }
  if (newPassword !== confirmPassword) return 'New password and confirmation do not match.';
  return null;
};
