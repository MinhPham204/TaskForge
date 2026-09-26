import assert from 'node:assert/strict';
import { API_PATHS } from '../utils/apiPaths.js';
import {
  passwordValidationMessage,
  profileUpdatePayload,
  profileValidationMessage,
} from '../utils/account.js';

assert.equal(API_PATHS.AUTH.GET_PROFILE, '/api/auth/me');
assert.equal(API_PATHS.AUTH.UPDATE_PROFILE, '/api/auth/profile');
assert.equal(API_PATHS.AUTH.CHANGE_PASSWORD, '/api/auth/change-password');
assert.equal(API_PATHS.AUTH.PREFERENCES, '/api/auth/preferences');

const backendProfile = {
  id: 'user-id',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  profileImageUrl: null,
};
const update = profileUpdatePayload({
  name: backendProfile.name,
  profileImageUrl: '',
});
assert.deepEqual(update, { name: 'Ada Lovelace', profileImageUrl: null });
assert.equal(Object.hasOwn(update, 'email'), false, 'email must never be sent in profile updates');
assert.equal(profileValidationMessage(update), null);
assert.equal(profileValidationMessage(profileUpdatePayload({ name: '   ' })), 'Enter your name.');

assert.equal(
  passwordValidationMessage({ currentPassword: 'current', newPassword: 'short', confirmPassword: 'short' }),
  'Your new password must be between 8 and 128 characters.',
);
assert.equal(
  passwordValidationMessage({ currentPassword: 'current', newPassword: 'new-password', confirmPassword: 'other-password' }),
  'New password and confirmation do not match.',
);
assert.equal(
  passwordValidationMessage({ currentPassword: 'current', newPassword: 'new-password', confirmPassword: 'new-password' }),
  null,
);

console.log('account-contract.test.js passed');
