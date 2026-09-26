import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layouts/DashboardLayout.jsx';
import { ErrorState, LoadingState } from '../../components/PageState.jsx';
import useTheme from '../../hooks/useTheme.js';
import { THEME_PREFERENCES } from '../../utils/theme.js';
import {
  useGetPersonalPreferencesQuery,
  useUpdatePersonalPreferencesMutation,
} from '../../services/authApi.js';

const TIMEZONES = [
  ['UTC', 'UTC'],
  ['Asia/Ho_Chi_Minh', 'Ho Chi Minh (UTC+7)'],
  ['Asia/Tokyo', 'Tokyo (UTC+9)'],
  ['Europe/London', 'London (GMT)'],
  ['America/New_York', 'New York (EST)'],
];
const LOCALES = [
  ['en-US', 'English (United States)'],
  ['vi-VN', 'Tiếng Việt'],
  ['ja-JP', '日本語'],
];

const PersonalSettings = () => {
  const { preference: themePreference, setThemePreference } = useTheme();
  const { data, isLoading, isError, error, refetch } = useGetPersonalPreferencesQuery();
  const [updatePreferences, { isLoading: isSaving }] = useUpdatePersonalPreferencesMutation();
  const [settings, setSettings] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (data) setSettings(data);
  }, [data]);

  const submit = async (event) => {
    event.preventDefault();
    setFeedback(null);
    try {
      const saved = await updatePreferences(settings).unwrap();
      setSettings(saved);
      setFeedback({ type: 'success', message: 'Preferences saved.' });
    } catch (requestError) {
      setFeedback({ type: 'error', message: apiMessage(requestError, 'Unable to save preferences.') });
    }
  };

  if (isError) {
    return (
      <SettingsShell>
        <ErrorState
          title="Unable to load preferences"
          message={apiMessage(error, 'Your personal preferences could not be loaded.')}
          onRetry={refetch}
        />
      </SettingsShell>
    );
  }

  if (isLoading || !settings) {
    return (
      <SettingsShell>
        <LoadingState label="Loading preferences" />
      </SettingsShell>
    );
  }

  return (
    <SettingsShell>
      <header className="border-b border-border/70 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-content sm:text-2xl">Preferences</h1>
        <p className="mt-1 text-xs text-content-muted sm:text-sm">
          Customize your appearance, regional formatting, and notification settings.
        </p>
      </header>

      <div className="space-y-6">
        {/* Appearance / Theme */}
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="appearance-heading">
          <div className="border-b border-border/60 pb-3">
            <h2 id="appearance-heading" className="text-sm font-semibold text-content">Appearance</h2>
            <p className="mt-0.5 text-xs text-content-muted">Choose your interface theme on this device.</p>
          </div>

          <div className="mt-4">
            <div className="inline-flex rounded-lg border border-border bg-surface-muted/60 p-1" role="radiogroup" aria-label="Theme preference">
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
                    className={`rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? 'border border-border/80 bg-surface font-semibold text-content shadow-xs'
                        : 'text-content-muted hover:text-content'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Regional & Language */}
        <form className="space-y-6" onSubmit={submit}>
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="regional-heading">
            <div className="border-b border-border/60 pb-3">
              <h2 id="regional-heading" className="text-sm font-semibold text-content">Regional</h2>
              <p className="mt-0.5 text-xs text-content-muted">Timezone and locale formatting preferences.</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Time zone" htmlFor="settings-timezone">
                <select
                  id="settings-timezone"
                  value={settings.timezone}
                  onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
                  className={inputClassName}
                >
                  {TIMEZONES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Locale" htmlFor="settings-locale">
                <select
                  id="settings-locale"
                  value={settings.locale}
                  onChange={(event) => setSettings({ ...settings, locale: event.target.value })}
                  className={inputClassName}
                >
                  {LOCALES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="First day of week" htmlFor="settings-week-start">
                <select
                  id="settings-week-start"
                  value={settings.weekStartsOn}
                  onChange={(event) => setSettings({ ...settings, weekStartsOn: Number(event.target.value) })}
                  className={inputClassName}
                >
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Notifications */}
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="notifications-heading">
            <div className="border-b border-border/60 pb-3">
              <h2 id="notifications-heading" className="text-sm font-semibold text-content">Notifications</h2>
              <p className="mt-0.5 text-xs text-content-muted">Manage in-app alert delivery.</p>
            </div>

            <div className="mt-4 flex items-center justify-between py-1">
              <div>
                <p className="text-xs font-medium text-content">In-app notifications</p>
                <p className="text-[11px] text-content-muted">Receive assignment and project updates in your inbox.</p>
              </div>
              <input
                id="settings-in-app"
                type="checkbox"
                checked={settings.inAppNotificationsEnabled}
                onChange={(event) => setSettings({ ...settings, inAppNotificationsEnabled: event.target.checked })}
                className="h-4 w-4 rounded border-border text-primary accent-primary"
              />
            </div>
          </section>

          <InlineFeedback feedback={feedback} />

          <div className="pt-1">
            <button type="submit" disabled={isSaving} className={primaryButtonClassName}>
              {isSaving ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </form>
      </div>
    </SettingsShell>
  );
};

const SettingsShell = ({ children }) => (
  <DashboardLayout activeMenu="/settings/personal">
    <div className="space-y-6 max-w-4xl">{children}</div>
  </DashboardLayout>
);

const Field = ({ label, htmlFor, children }) => (
  <div>
    <label htmlFor={htmlFor} className="text-xs font-medium text-content">
      {label}
    </label>
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
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content shadow-xs focus:border-primary focus:outline-hidden';
const primaryButtonClassName =
  'inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60';

export default PersonalSettings;
