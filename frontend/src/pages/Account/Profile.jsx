import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layouts/DashboardLayout.jsx';
import Avatar from '../../components/Avatar.jsx';
import { ErrorState, LoadingState } from '../../components/PageState.jsx';
import {
  useChangePasswordMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
} from '../../services/authApi.js';
import { logout, setUser } from '../../store/authSlice.js';
import {
  passwordValidationMessage,
  profileUpdatePayload,
  profileValidationMessage,
} from '../../utils/account.js';

const Profile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { data: user, isLoading, isError, error, refetch } = useGetProfileQuery();
  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();
  const [profile, setProfile] = useState({ name: '', profileImageUrl: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileFeedback, setProfileFeedback] = useState(null);
  const [passwordFeedback, setPasswordFeedback] = useState(null);

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', profileImageUrl: user.profileImageUrl || '' });
  }, [user]);

  useEffect(() => {
    if (passwordFeedback?.type !== 'success') return undefined;
    const timer = window.setTimeout(() => {
      dispatch(logout());
      navigate('/login', { replace: true });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [dispatch, navigate, passwordFeedback]);

  const submitProfile = async (event) => {
    event.preventDefault();
    const payload = profileUpdatePayload(profile);
    const validationMessage = profileValidationMessage(payload);
    if (validationMessage) {
      setProfileFeedback({ type: 'error', message: validationMessage });
      return;
    }

    setProfileFeedback(null);
    try {
      const updatedUser = await updateProfile(payload).unwrap();
      dispatch(setUser(updatedUser));
      setProfileFeedback({ type: 'success', message: 'Profile updated successfully.' });
    } catch (requestError) {
      setProfileFeedback({ type: 'error', message: apiMessage(requestError, 'Unable to update your profile.') });
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    const validationMessage = passwordValidationMessage(passwords);
    if (validationMessage) {
      setPasswordFeedback({ type: 'error', message: validationMessage });
      return;
    }

    setPasswordFeedback(null);
    try {
      await changePassword(passwords).unwrap();
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordFeedback({ type: 'success', message: 'Password changed. You will be signed out shortly.' });
    } catch (requestError) {
      setPasswordFeedback({ type: 'error', message: apiMessage(requestError, 'Unable to change your password.') });
    }
  };

  if (isLoading) return <AccountShell><LoadingState label="Loading your account" /></AccountShell>;
  if (isError) return <AccountShell><ErrorState title="Unable to load your account" message={apiMessage(error, 'Your account details could not be loaded.')} onRetry={refetch} /></AccountShell>;

  return (
    <AccountShell>
      <header className="border-b border-border/70 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-content sm:text-2xl">Account</h1>
        <p className="mt-1 text-xs text-content-muted sm:text-sm">Manage your personal profile details and security credentials.</p>
      </header>

      <div className="space-y-6">
        {/* Profile Details */}
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="profile-heading">
          <div className="border-b border-border/60 pb-3">
            <h2 id="profile-heading" className="text-sm font-semibold text-content">Profile</h2>
            <p className="mt-0.5 text-xs text-content-muted">Your public identity within workspaces.</p>
          </div>

          <div className="mt-5 flex items-center gap-4">
            <Avatar
              src={profile.profileImageUrl || user?.profileImageUrl}
              name={profile.name || user?.name}
              alt={`${user?.name || 'User'} avatar`}
              className="h-14 w-14 rounded-full border border-border"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-content">{user?.name}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-xs text-content-muted">{user?.email}</span>
                <span className="inline-flex shrink-0 items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  Verified
                </span>
              </div>
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={submitProfile}>
            <Field label="Full name" htmlFor="account-name">
              <input
                id="account-name"
                name="name"
                type="text"
                autoComplete="name"
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                maxLength={120}
                required
                className={inputClassName}
              />
            </Field>

            <Field label="Avatar URL" htmlFor="account-avatar" hint="Direct link to your image (JPG, PNG).">
              <input
                id="account-avatar"
                name="profileImageUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={profile.profileImageUrl}
                onChange={(event) => setProfile({ ...profile, profileImageUrl: event.target.value })}
                placeholder="https://example.com/avatar.png"
                className={inputClassName}
              />
            </Field>

            <Field label="Email address" htmlFor="account-email" hint="Contact workspace admins to update your primary email.">
              <input
                id="account-email"
                type="email"
                value={user?.email || ''}
                readOnly
                aria-readonly="true"
                className={`${inputClassName} cursor-not-allowed bg-surface-muted opacity-80`}
              />
            </Field>

            <InlineFeedback feedback={profileFeedback} />

            <div className="pt-1">
              <button type="submit" disabled={isUpdatingProfile} className={primaryButtonClassName}>
                {isUpdatingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        {/* Security / Password */}
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="security-heading">
          <div className="border-b border-border/60 pb-3">
            <h2 id="security-heading" className="text-sm font-semibold text-content">Password</h2>
            <p className="mt-0.5 text-xs text-content-muted">Use at least 8 characters. Updating will sign you out.</p>
          </div>

          <form className="mt-5 space-y-4" onSubmit={submitPassword}>
            <Field label="Current password" htmlFor="current-password">
              <input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                disabled={passwordFeedback?.type === 'success'}
                required
                className={inputClassName}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="New password" htmlFor="new-password">
                <input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.newPassword}
                  onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                  disabled={passwordFeedback?.type === 'success'}
                  minLength={8}
                  maxLength={128}
                  required
                  className={inputClassName}
                />
              </Field>

              <Field label="Confirm new password" htmlFor="confirm-password">
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirmPassword}
                  onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })}
                  disabled={passwordFeedback?.type === 'success'}
                  minLength={8}
                  maxLength={128}
                  required
                  className={inputClassName}
                />
              </Field>
            </div>

            <InlineFeedback feedback={passwordFeedback} />

            <div className="pt-1">
              <button
                type="submit"
                disabled={isChangingPassword || passwordFeedback?.type === 'success'}
                className={primaryButtonClassName}
              >
                {isChangingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AccountShell>
  );
};

const AccountShell = ({ children }) => (
  <DashboardLayout activeMenu="/account">
    <div className="space-y-6 max-w-4xl">{children}</div>
  </DashboardLayout>
);

const Field = ({ label, htmlFor, hint, children }) => (
  <div>
    <div className="flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-xs font-medium text-content">
        {label}
      </label>
      {hint && <span className="text-[11px] text-content-muted">{hint}</span>}
    </div>
    <div className="mt-1.5">{children}</div>
  </div>
);

const InlineFeedback = ({ feedback }) =>
  feedback ? (
    <p
      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
        feedback.type === 'success'
          ? 'border-success-content/30 bg-success-surface text-success-content'
          : 'border-danger-border bg-danger-surface text-danger-content'
      }`}
      role={feedback.type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {feedback.message}
    </p>
  ) : null;

const apiMessage = (error, fallback) => (typeof error?.data?.message === 'string' ? error.data.message : fallback);
const inputClassName =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content shadow-xs placeholder:text-content-muted/60 focus:border-primary focus:outline-hidden';
const primaryButtonClassName =
  'inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60';

export default Profile;
