import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  THEME_PREFERENCES,
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
} from '../utils/theme.js';
import { ThemeContext } from '../contexts/themeContext.js';

export const ThemeProvider = ({ children }) => {
  const userId = useSelector((state) => state.auth.user?.id);
  const [preference, setPreference] = useState(() => readThemePreference(userId));

  useEffect(() => {
    const nextPreference = readThemePreference(userId);
    setPreference(nextPreference);
    applyThemePreference(nextPreference);
  }, [userId]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const onChange = () => {
      if (preference === THEME_PREFERENCES.SYSTEM) {
        applyThemePreference(preference);
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const value = useMemo(() => ({
    preference,
    setThemePreference: (nextPreference) => {
      const saved = persistThemePreference(userId, nextPreference);
      setPreference(saved);
      applyThemePreference(saved);
    },
  }), [preference, userId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
