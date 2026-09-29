export const THEME_PREFERENCES = Object.freeze({
  SYSTEM: 'SYSTEM',
  LIGHT: 'LIGHT',
  DARK: 'DARK',
});

const STORAGE_PREFIX = 'taskforge:theme:';

export const themeStorageKey = (userId) =>
  `${STORAGE_PREFIX}${userId || 'anonymous'}`;

export const normalizeThemePreference = (value) =>
  Object.values(THEME_PREFERENCES).includes(value)
    ? value
    : THEME_PREFERENCES.SYSTEM;

export const readThemePreference = (userId) => {
  try {
    return normalizeThemePreference(localStorage.getItem(themeStorageKey(userId)));
  } catch (_) {
    return THEME_PREFERENCES.SYSTEM;
  }
};

export const persistThemePreference = (userId, preference) => {
  const normalized = normalizeThemePreference(preference);
  try {
    localStorage.setItem(themeStorageKey(userId), normalized);
  } catch (_) {
    // A private browser context may disallow local storage. The runtime theme still works.
  }
  return normalized;
};

export const resolveTheme = (preference, prefersDark) => {
  const normalized = normalizeThemePreference(preference);
  if (normalized === THEME_PREFERENCES.SYSTEM) {
    return prefersDark ? 'dark' : 'light';
  }
  return normalized.toLowerCase();
};

export const applyThemePreference = (preference) => {
  if (typeof document === 'undefined') return;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const resolved = resolveTheme(preference, prefersDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
};
