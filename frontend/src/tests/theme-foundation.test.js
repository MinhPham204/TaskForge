import assert from 'node:assert/strict';
import {
  THEME_PREFERENCES,
  normalizeThemePreference,
  resolveTheme,
  themeStorageKey,
} from '../utils/theme.js';

assert.equal(themeStorageKey('user-123'), 'taskforge:theme:user-123');
assert.equal(themeStorageKey(), 'taskforge:theme:anonymous');
assert.equal(normalizeThemePreference('LIGHT'), THEME_PREFERENCES.LIGHT);
assert.equal(normalizeThemePreference('invalid'), THEME_PREFERENCES.SYSTEM);
assert.equal(resolveTheme(THEME_PREFERENCES.DARK, false), 'dark');
assert.equal(resolveTheme(THEME_PREFERENCES.LIGHT, true), 'light');
assert.equal(resolveTheme(THEME_PREFERENCES.SYSTEM, true), 'dark');
assert.equal(resolveTheme(THEME_PREFERENCES.SYSTEM, false), 'light');

console.log('theme-foundation.test.js passed');
