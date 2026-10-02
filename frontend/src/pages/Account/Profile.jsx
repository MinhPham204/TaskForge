import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import DashboardLayout from '../../components/layouts/DashboardLayout.jsx';
import Avatar from '../../components/Avatar.jsx';
import { Dialog, ErrorState, LoadingState } from '../../components/PageState.jsx';
import {
  LuCheck,
  LuShieldCheck,
  LuKeyRound,
  LuBell,
  LuShare2,
  LuSlidersHorizontal,
  LuUser,
  LuMail,
  LuGlobe,
  LuUpload,
  LuTrash2,
  LuCircle,
  LuExternalLink,
  LuLock,
} from 'react-icons/lu';
import {
  useChangePasswordMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useGetPersonalPreferencesQuery,
  useUpdatePersonalPreferencesMutation,
} from '../../services/authApi.js';
import { logout, setUser } from '../../store/authSlice.js';
import {
  passwordValidationMessage,
  profileUpdatePayload,
  profileValidationMessage,
} from '../../utils/account.js';
import useTheme from '../../hooks/useTheme.js';
import { THEME_PREFERENCES } from '../../utils/theme.js';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Ho_Chi_Minh', label: 'UTC+07:00 (Indochina Time / Ho Chi Minh)' },
  { value: 'UTC', label: 'UTC+00:00 (London, GMT)' },
  { value: 'Asia/Tokyo', label: 'UTC+09:00 (Tokyo, JST)' },
  { value: 'America/New_York', label: 'UTC-05:00 (Eastern Time, US & Canada)' },
  { value: 'America/Los_Angeles', label: 'UTC-08:00 (Pacific Time, US & Canada)' },
];

const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'ja-JP', label: '日本語' },
];

const Profile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Active tab state
  const [activeTab, setActiveTab] = useState('profile');

  // Queries & Mutations
  const { data: user, isLoading: isUserLoading, isError: isUserError, error: userError, refetch: refetchUser } = useGetProfileQuery();
  const { data: preferencesData } = useGetPersonalPreferencesQuery();
  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();
  const [updatePreferences, { isLoading: isUpdatingPreferences }] = useUpdatePersonalPreferencesMutation();

  // Theme
  const { preference: themePreference, setThemePreference } = useTheme();

  // Local state
  const [profile, setProfile] = useState({
    name: '',
    profileImageUrl: '',
    handle: '',
    jobTitle: 'Staff Product Engineer',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  const [showAvatarUrlInput, setShowAvatarUrlInput] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [profileFeedback, setProfileFeedback] = useState(null);
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const [prefFeedback, setPrefFeedback] = useState(null);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);

  // Sync profile form when user data loads
  useEffect(() => {
    if (user) {
      const defaultHandle = user.email ? user.email.split('@')[0] : 'user';
      setProfile((prev) => ({
        ...prev,
        name: user.name || '',
        profileImageUrl: user.profileImageUrl || '',
        handle: prev.handle || defaultHandle,
      }));
    }
  }, [user]);

  // Sync preferences data when loaded
  useEffect(() => {
    if (preferencesData?.timezone) {
      setProfile((prev) => ({
        ...prev,
        timezone: preferencesData.timezone,
      }));
    }
  }, [preferencesData]);

  // Sign out after password update
  useEffect(() => {
    if (passwordFeedback?.type !== 'success') return undefined;
    const timer = window.setTimeout(() => {
      dispatch(logout());
      navigate('/login', { replace: true });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [dispatch, navigate, passwordFeedback]);

  // Handler: Update Profile
  const handleSubmitProfile = async (event) => {
    event.preventDefault();
    setProfileFeedback(null);

    const payload = profileUpdatePayload({
      name: profile.name,
      profileImageUrl: profile.profileImageUrl,
    });
    const validationMessage = profileValidationMessage(payload);
    if (validationMessage) {
      setProfileFeedback({ type: 'error', message: validationMessage });
      return;
    }

    try {
      const updatedUser = await updateProfile(payload).unwrap();
      dispatch(setUser(updatedUser));

      // Also persist timezone if preferences query is active
      if (preferencesData && preferencesData.timezone !== profile.timezone) {
        await updatePreferences({
          ...preferencesData,
          timezone: profile.timezone,
        }).unwrap();
      }

      setProfileFeedback({ type: 'success', message: 'Profile updated successfully.' });
      setShowAvatarUrlInput(false);
    } catch (requestError) {
      setProfileFeedback({
        type: 'error',
        message: apiMessage(requestError, 'Unable to update your profile.'),
      });
    }
  };

  // Handler: Change Password
  const handleSubmitPassword = async (event) => {
    event.preventDefault();
    setPasswordFeedback(null);

    const validationMessage = passwordValidationMessage(passwords);
    if (validationMessage) {
      setPasswordFeedback({ type: 'error', message: validationMessage });
      return;
    }

    try {
      await changePassword(passwords).unwrap();
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordFeedback({
        type: 'success',
        message: 'Password changed successfully. You will be signed out shortly.',
      });
    } catch (requestError) {
      setPasswordFeedback({
        type: 'error',
        message: apiMessage(requestError, 'Unable to change your password.'),
      });
    }
  };

  // Password requirements calculation
  const is8Chars = (passwords.newPassword || '').length >= 8;
  const hasUpper = /[A-Z]/.test(passwords.newPassword || '');
  const hasSpecialOrNum = /[0-9!@#$%^&*(),.?":{}|<>]/.test(passwords.newPassword || '');

  // Initials
  const initials = user?.name
    ? user.name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AJ';

  if (isUserLoading) {
    return (
      <DashboardLayout activeMenu="/account">
        <div className="space-y-5 pb-12 select-none">
          <LoadingState label="Loading your account" />
        </div>
      </DashboardLayout>
    );
  }

  if (isUserError) {
    return (
      <DashboardLayout activeMenu="/account">
        <div className="space-y-5 pb-12 select-none">
          <ErrorState
            title="Unable to load your account"
            message={apiMessage(userError, 'Your account details could not be loaded.')}
            onRetry={refetchUser}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="/account">
      <div className="space-y-5 pb-12 select-none">
        {/* Breadcrumb matching Workspace & Dashboard */}
        <div className="pb-1 border-b border-border/60">
          <div className="flex items-center gap-2 text-xs text-content-muted mb-1">
            <Link to="/dashboard" className="hover:text-content transition-colors">
              Settings
            </Link>
            <span>/</span>
            <span className="text-content font-medium">Account</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-content">Account</h1>
              <p className="mt-1 text-xs sm:text-sm text-content-muted">
                Manage your personal profile details, preferences, and security credentials.
              </p>
            </div>
          </div>
        </div>

        {/* Tabbed Navigation matching Stitch Account Reference */}
        <div className="border-b border-border">
          <nav aria-label="Tabs" className="-mb-px flex space-x-6 overflow-x-auto text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`pb-2.5 text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Profile
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'security'
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Security &amp; Password
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'notifications'
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Notifications
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('connections')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'connections'
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Connected Accounts
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`pb-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'preferences'
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-content-muted hover:text-content hover:border-border'
              }`}
            >
              Preferences
            </button>
          </nav>
        </div>

        {/* TAB 1: PROFILE (Overview) */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Card 1: Profile Information Card */}
            <section
              className="bg-surface rounded-xl border border-border shadow-xs divide-y divide-border/60"
              data-purpose="profile-card"
            >
              <div className="p-6">
                <div>
                  <h2 className="text-base font-semibold text-content">Profile</h2>
                  <p className="text-xs text-content-muted mt-0.5">
                    Your public identity within workspaces and team activity.
                  </p>
                </div>

                {/* Avatar Identity Sub-section */}
                <div className="mt-6 flex flex-wrap items-center gap-5">
                  <div className="relative group">
                    {profile.profileImageUrl || user?.profileImageUrl ? (
                      <img
                        src={profile.profileImageUrl || user?.profileImageUrl}
                        alt={user?.name}
                        className="w-16 h-16 rounded-full object-cover border-2 border-surface shadow-sm ring-1 ring-border"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-lg border-2 border-surface shadow-sm ring-1 ring-border">
                        {initials}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-content">{user?.name}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <LuCheck className="w-3 h-3 text-emerald-600" />
                        Verified
                      </span>
                    </div>

                    <div className="text-xs text-content-muted">{user?.email}</div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAvatarUrlInput(!showAvatarUrlInput)}
                        className="text-xs font-medium text-content bg-surface border border-border hover:bg-surface-muted px-2.5 py-1 rounded-md shadow-2xs transition-colors cursor-pointer"
                      >
                        Upload new picture
                      </button>
                      {(profile.profileImageUrl || user?.profileImageUrl) && (
                        <button
                          type="button"
                          onClick={() => setProfile({ ...profile, profileImageUrl: '' })}
                          className="text-xs font-medium text-content-muted hover:text-danger-content px-2 py-1 rounded-md transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Optional Avatar URL Input Toggle */}
                {showAvatarUrlInput && (
                  <div className="mt-4 p-3.5 bg-surface-muted rounded-lg border border-border space-y-2">
                    <label htmlFor="avatar-direct-url" className="block text-xs font-medium text-content">
                      Avatar URL (Direct link to image)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="avatar-direct-url"
                        type="url"
                        placeholder="https://example.com/avatar.png"
                        value={profile.profileImageUrl}
                        onChange={(e) => setProfile({ ...profile, profileImageUrl: e.target.value })}
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAvatarUrlInput(false)}
                        className="px-3 py-1.5 text-xs text-content-muted hover:text-content border border-border rounded-md cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}

                {/* Profile Form Fields */}
                <form id="profile-form" className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5" onSubmit={handleSubmitProfile}>
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-medium text-content mb-1.5" htmlFor="fullName">
                      Full name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      required
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className={inputClassName}
                    />
                  </div>

                  {/* Display Handle */}
                  <div>
                    <label className="block text-xs font-medium text-content mb-1.5" htmlFor="handle">
                      Display handle
                    </label>
                    <div className="relative rounded-lg shadow-2xs">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted text-xs font-mono">
                        @
                      </span>
                      <input
                        id="handle"
                        type="text"
                        value={profile.handle}
                        onChange={(e) => setProfile({ ...profile, handle: e.target.value })}
                        className={`${inputClassName} pl-7`}
                      />
                    </div>
                  </div>

                  {/* Email Address */}
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-content" htmlFor="email">
                        Email address
                      </label>
                      <span className="text-[11px] text-content-muted">
                        Contact workspace admins to update your primary email.
                      </span>
                    </div>
                    <input
                      id="email"
                      type="email"
                      readOnly
                      value={user?.email || ''}
                      className="w-full text-xs rounded-lg border border-border bg-surface-muted text-content-muted py-2 px-3 cursor-not-allowed"
                    />
                  </div>

                  {/* Avatar URL field */}
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-content" htmlFor="avatarUrl">
                        Avatar URL
                      </label>
                      <span className="text-[11px] text-content-muted">
                        Direct link to your image (JPG, PNG).
                      </span>
                    </div>
                    <input
                      id="avatarUrl"
                      type="url"
                      placeholder="https://example.com/avatar.png"
                      value={profile.profileImageUrl}
                      onChange={(e) => setProfile({ ...profile, profileImageUrl: e.target.value })}
                      className={inputClassName}
                    />
                  </div>

                  {/* Job Title */}
                  <div>
                    <label className="block text-xs font-medium text-content mb-1.5" htmlFor="jobTitle">
                      Job title
                    </label>
                    <input
                      id="jobTitle"
                      type="text"
                      value={profile.jobTitle}
                      onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                      className={inputClassName}
                    />
                  </div>

                  {/* Timezone */}
                  <div>
                    <label className="block text-xs font-medium text-content mb-1.5" htmlFor="timezone">
                      Timezone
                    </label>
                    <select
                      id="timezone"
                      value={profile.timezone}
                      onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                      className={`${inputClassName} bg-surface`}
                    >
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </form>

                <div className="mt-4">
                  <InlineFeedback feedback={profileFeedback} />
                </div>
              </div>

              {/* Profile Card Footer */}
              <div className="px-6 py-3.5 bg-surface-muted/60 rounded-b-xl flex items-center justify-between">
                <span className="text-[11px] text-content-muted">
                  Unsaved changes will be discarded on page refresh.
                </span>
                <button
                  type="submit"
                  form="profile-form"
                  disabled={isUpdatingProfile}
                  className="px-4 py-2 bg-primary hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-60"
                >
                  {isUpdatingProfile ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </section>

            {/* Card 2: Security & Password Card */}
            <section
              className="bg-surface rounded-xl border border-border shadow-xs divide-y divide-border/60"
              data-purpose="security-card"
            >
              <div className="p-6">
                <div>
                  <h2 className="text-base font-semibold text-content">Password</h2>
                  <p className="text-xs text-content-muted mt-0.5">
                    Use at least 8 characters. Updating will sign you out of other active sessions.
                  </p>
                </div>

                <form id="password-form" className="mt-6 space-y-4 max-w-2xl" onSubmit={handleSubmitPassword}>
                  {/* Current Password */}
                  <div>
                    <label className="block text-xs font-medium text-content mb-1.5" htmlFor="currentPassword">
                      Current password
                    </label>
                    <input
                      id="currentPassword"
                      type="password"
                      placeholder="••••••••••••"
                      value={passwords.currentPassword}
                      onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                      required
                      className={inputClassName}
                    />
                  </div>

                  {/* New and Confirm Password Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-content mb-1.5" htmlFor="newPassword">
                        New password
                      </label>
                      <input
                        id="newPassword"
                        type="password"
                        placeholder="••••••••••••"
                        value={passwords.newPassword}
                        onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                        required
                        className={inputClassName}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-content mb-1.5" htmlFor="confirmPassword">
                        Confirm new password
                      </label>
                      <input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••••••"
                        value={passwords.confirmPassword}
                        onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                        required
                        className={inputClassName}
                      />
                    </div>
                  </div>

                  {/* Password Guidelines Checklist */}
                  <div className="p-3 bg-surface-muted rounded-lg border border-border">
                    <div className="text-[11px] font-medium text-content-muted mb-1.5">
                      Password requirements:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-content-muted">
                      <div className="flex items-center gap-1.5">
                        {is8Chars ? (
                          <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <LuCircle className="w-3.5 h-3.5 text-content-muted/40" />
                        )}
                        <span className={is8Chars ? 'text-content font-medium' : ''}>8+ characters</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasUpper ? (
                          <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <LuCircle className="w-3.5 h-3.5 text-content-muted/40" />
                        )}
                        <span className={hasUpper ? 'text-content font-medium' : ''}>1 uppercase letter</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasSpecialOrNum ? (
                          <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <LuCircle className="w-3.5 h-3.5 text-content-muted/40" />
                        )}
                        <span className={hasSpecialOrNum ? 'text-content font-medium' : ''}>1 number or symbol</span>
                      </div>
                    </div>
                  </div>

                  <InlineFeedback feedback={passwordFeedback} />
                </form>
              </div>

              {/* Password Footer Button */}
              <div className="px-6 py-3.5 bg-surface-muted/60 rounded-b-xl flex justify-between items-center text-xs">
                <span className="text-content-muted">
                  Need help?{' '}
                  <Link to="/forgot-password" className="text-primary hover:underline font-medium">
                    Reset via email
                  </Link>
                </span>
                <button
                  type="submit"
                  form="password-form"
                  disabled={isChangingPassword}
                  className="px-4 py-2 bg-primary hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-60"
                >
                  {isChangingPassword ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </section>

            {/* Card 3: Two-Factor Authentication Teaser */}
            <section
              className="bg-surface rounded-xl border border-border shadow-xs p-6"
              data-purpose="security-2fa"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-800">
                    <LuShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-content">Two-Factor Authentication (2FA)</h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">
                      Secure your TaskForge account with authenticator apps (TOTP) or hardware security keys.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTwoFactorModalOpen(true)}
                  className="px-3.5 py-1.5 text-xs font-medium text-content bg-surface border border-border hover:bg-surface-muted rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Configure
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: SECURITY & PASSWORD ONLY */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Password Card */}
            <section className="bg-surface rounded-xl border border-border shadow-xs divide-y divide-border/60">
              <div className="p-6">
                <div>
                  <h2 className="text-base font-semibold text-content">Password &amp; Credentials</h2>
                  <p className="text-xs text-content-muted mt-0.5">
                    Update your account password regularly to keep your credentials protected.
                  </p>
                </div>

                <form id="password-form-tab" className="mt-6 space-y-4 max-w-2xl" onSubmit={handleSubmitPassword}>
                  <div>
                    <label className="block text-xs font-medium text-content mb-1.5" htmlFor="tab-curr-pass">
                      Current password
                    </label>
                    <input
                      id="tab-curr-pass"
                      type="password"
                      placeholder="••••••••••••"
                      value={passwords.currentPassword}
                      onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                      required
                      className={inputClassName}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-content mb-1.5" htmlFor="tab-new-pass">
                        New password
                      </label>
                      <input
                        id="tab-new-pass"
                        type="password"
                        placeholder="••••••••••••"
                        value={passwords.newPassword}
                        onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                        required
                        className={inputClassName}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-content mb-1.5" htmlFor="tab-conf-pass">
                        Confirm new password
                      </label>
                      <input
                        id="tab-conf-pass"
                        type="password"
                        placeholder="••••••••••••"
                        value={passwords.confirmPassword}
                        onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                        required
                        className={inputClassName}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-surface-muted rounded-lg border border-border">
                    <div className="text-[11px] font-medium text-content-muted mb-1.5">
                      Password requirements:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-content-muted">
                      <div className="flex items-center gap-1.5">
                        {is8Chars ? (
                          <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <LuCircle className="w-3.5 h-3.5 text-content-muted/40" />
                        )}
                        <span className={is8Chars ? 'text-content font-medium' : ''}>8+ characters</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasUpper ? (
                          <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <LuCircle className="w-3.5 h-3.5 text-content-muted/40" />
                        )}
                        <span className={hasUpper ? 'text-content font-medium' : ''}>1 uppercase letter</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasSpecialOrNum ? (
                          <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <LuCircle className="w-3.5 h-3.5 text-content-muted/40" />
                        )}
                        <span className={hasSpecialOrNum ? 'text-content font-medium' : ''}>1 number or symbol</span>
                      </div>
                    </div>
                  </div>

                  <InlineFeedback feedback={passwordFeedback} />
                </form>
              </div>

              <div className="px-6 py-3.5 bg-surface-muted/60 rounded-b-xl flex justify-between items-center text-xs">
                <span className="text-content-muted">
                  Need help?{' '}
                  <Link to="/forgot-password" className="text-primary hover:underline font-medium">
                    Reset via email
                  </Link>
                </span>
                <button
                  type="submit"
                  form="password-form-tab"
                  disabled={isChangingPassword}
                  className="px-4 py-2 bg-primary hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-60"
                >
                  {isChangingPassword ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </section>

            {/* 2FA Section */}
            <section className="bg-surface rounded-xl border border-border shadow-xs p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-800">
                    <LuShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-content">Two-Factor Authentication (2FA)</h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">
                      Protect your account against unauthorized sign-in attempts with TOTP codes.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTwoFactorModalOpen(true)}
                  className="px-3.5 py-1.5 text-xs font-medium text-content bg-surface border border-border hover:bg-surface-muted rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Configure
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <section className="bg-surface rounded-xl border border-border shadow-xs p-6 space-y-6">
            <div className="border-b border-border/60 pb-3">
              <h2 className="text-base font-semibold text-content">Notification Preferences</h2>
              <p className="text-xs text-content-muted mt-0.5">
                Configure how and when TaskForge sends you task updates and activity alerts.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-surface-muted border border-border">
                <div>
                  <div className="text-sm font-semibold text-content">In-App Notifications</div>
                  <div className="text-xs text-content-muted mt-0.5">
                    Receive live notifications inside the inbox for assignments, mentions, and status updates.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferencesData?.inAppNotificationsEnabled ?? true}
                    onChange={async (e) => {
                      if (!preferencesData) return;
                      await updatePreferences({
                        ...preferencesData,
                        inAppNotificationsEnabled: e.target.checked,
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-surface-muted border border-border">
                <div>
                  <div className="text-sm font-semibold text-content">Email Digest &amp; Summaries</div>
                  <div className="text-xs text-content-muted mt-0.5">
                    Daily summary of critical blocked tasks and pending approvals assigned to you.
                  </div>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Transactional Only
                </span>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: CONNECTED ACCOUNTS */}
        {activeTab === 'connections' && (
          <section className="bg-surface rounded-xl border border-border shadow-xs p-6 space-y-6">
            <div className="border-b border-border/60 pb-3">
              <h2 className="text-base font-semibold text-content">Connected Accounts</h2>
              <p className="text-xs text-content-muted mt-0.5">
                Manage third-party login providers and external developer tools connected to your profile.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Google */}
              <div className="p-4 rounded-lg bg-surface-muted border border-border flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center font-bold text-sm text-red-500">
                    G
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-content">Google Account</h3>
                    <p className="text-[11px] text-content-muted">{user?.email}</p>
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Connected
                </span>
              </div>

              {/* GitHub */}
              <div className="p-4 rounded-lg bg-surface-muted border border-border flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center font-bold text-sm text-content">
                    GH
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-content">GitHub</h3>
                    <p className="text-[11px] text-content-muted">Link commits and PR triage</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs font-medium text-content bg-surface border border-border hover:bg-surface-muted rounded-md transition-colors cursor-pointer"
                >
                  Connect
                </button>
              </div>
            </div>
          </section>
        )}

        {/* TAB 5: PREFERENCES (Theme & Regional) */}
        {activeTab === 'preferences' && (
          <div className="space-y-6">
            {/* Appearance / Theme */}
            <section className="bg-surface rounded-xl border border-border shadow-xs p-6 space-y-4">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-semibold text-content">Appearance</h2>
                <p className="text-xs text-content-muted mt-0.5">
                  Choose your interface theme on this device.
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-border bg-surface-muted p-1" role="radiogroup">
                {Object.values(THEME_PREFERENCES).map((option) => {
                  const isActive = themePreference === option;
                  const label = option[0] + option.slice(1).toLowerCase();
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setThemePreference(option)}
                      className={`rounded-md px-4 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'border border-border bg-surface font-semibold text-content shadow-xs'
                          : 'text-content-muted hover:text-content'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Regional Formatting */}
            <section className="bg-surface rounded-xl border border-border shadow-xs p-6 space-y-4">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-semibold text-content">Regional &amp; Localization</h2>
                <p className="text-xs text-content-muted mt-0.5">
                  Set language format, starting day of the week, and primary timezone.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pref-locale" className="block text-xs font-medium text-content mb-1.5">
                    Locale format
                  </label>
                  <select
                    id="pref-locale"
                    value={preferencesData?.locale || 'en-US'}
                    onChange={async (e) => {
                      if (!preferencesData) return;
                      await updatePreferences({
                        ...preferencesData,
                        locale: e.target.value,
                      });
                    }}
                    className={inputClassName}
                  >
                    {LOCALE_OPTIONS.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pref-timezone" className="block text-xs font-medium text-content mb-1.5">
                    Default Timezone
                  </label>
                  <select
                    id="pref-timezone"
                    value={preferencesData?.timezone || 'UTC'}
                    onChange={async (e) => {
                      if (!preferencesData) return;
                      await updatePreferences({
                        ...preferencesData,
                        timezone: e.target.value,
                      });
                    }}
                    className={inputClassName}
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pref-weekstarts" className="block text-xs font-medium text-content mb-1.5">
                    Week starts on
                  </label>
                  <select
                    id="pref-weekstarts"
                    value={preferencesData?.weekStartsOn ?? 1}
                    onChange={async (e) => {
                      if (!preferencesData) return;
                      await updatePreferences({
                        ...preferencesData,
                        weekStartsOn: Number(e.target.value),
                      });
                    }}
                    className={inputClassName}
                  >
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
                  </select>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* 2FA Configuration Dialog */}
        <Dialog
          open={twoFactorModalOpen}
          title="Two-Factor Authentication (2FA)"
          onClose={() => setTwoFactorModalOpen(false)}
          actions={
            <button
              type="button"
              onClick={() => setTwoFactorModalOpen(false)}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 cursor-pointer"
            >
              Close
            </button>
          }
        >
          <div className="space-y-3 text-xs text-content-muted">
            <p>
              Two-Factor Authentication is currently active for your credentials via registered authenticator app (TOTP).
            </p>
            <p>
              When logging in from a new browser session or unrecognized device, you will be prompted to enter your 6-digit verification code.
            </p>
            <div className="p-3 bg-surface-muted rounded-lg border border-border text-[11px] space-y-1">
              <div className="font-semibold text-content">Backup Security Codes:</div>
              <div>Store your offline emergency codes in a safe password manager to ensure recovery access.</div>
            </div>
          </div>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

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
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs sm:text-sm text-content shadow-xs placeholder:text-content-muted/60 focus:border-primary focus:outline-hidden';

export default Profile;
