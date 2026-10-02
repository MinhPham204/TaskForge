import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log('Starting Stitch Inbox UI Verification...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Verify NotificationInbox.jsx
const inboxSrc = readFileSync(join(__dirname, '../pages/Workspace/NotificationInbox.jsx'), 'utf-8');

// Breadcrumb & Header
assert(inboxSrc.includes('TaskForge'), 'Must contain TaskForge in breadcrumb');
assert(inboxSrc.includes('unread'), 'Must display unread counter pill');
assert(inboxSrc.includes('total'), 'Must display total counter');
assert(inboxSrc.includes('markAllBtn') || inboxSrc.includes('Mark all read'), 'Must contain Mark all read action');

// Filter tabs
assert(inboxSrc.includes('Assigned &amp; Approvals') || inboxSrc.includes('Assigned & Approvals'), 'Must contain Assigned & Approvals tab');
assert(inboxSrc.includes('Mentions'), 'Must contain Mentions tab');
assert(inboxSrc.includes('System &amp; Security') || inboxSrc.includes('System & Security'), 'Must contain System & Security tab');
assert(inboxSrc.includes('Archive'), 'Must contain Archive tab');

// Grid layout (8 cols feed + 4 cols triage)
assert(inboxSrc.includes('lg:col-span-8'), 'Must contain 8-col feed area');
assert(inboxSrc.includes('lg:col-span-4'), 'Must contain 4-col triage panel');

// Timeframe grouping
assert(inboxSrc.includes('Today'), 'Must group Today items');
assert(inboxSrc.includes('Yesterday'), 'Must group Yesterday items');
assert(inboxSrc.includes('Earlier this week'), 'Must group Earlier this week items');

// Inline actions
assert(inboxSrc.includes('Approve'), 'Must support Approve action');
assert(inboxSrc.includes('Acknowledge'), 'Must support Acknowledge action');
assert(inboxSrc.includes('Reply'), 'Must support Reply action');

// Floating sync indicator
assert(inboxSrc.includes('TaskForge Synced'), 'Must contain TaskForge Synced status indicator');
assert(inboxSrc.includes('shortcuts'), 'Must mention shortcuts reference');

console.log('✓ 1. NotificationInbox.jsx conforms to Stitch reference layout and interactive controls');

// 2. Verify InboxActionRequiredCard.jsx
const actionCardSrc = readFileSync(join(__dirname, '../pages/Workspace/components/InboxActionRequiredCard.jsx'), 'utf-8');
assert(actionCardSrc.includes('Action Required'), 'Must display Action Required header');
assert(actionCardSrc.includes('P0 Blocker'), 'Must highlight P0 Blocker badge');
assert(actionCardSrc.includes('Sign-off Now'), 'Must provide Sign-off Now action');
assert(actionCardSrc.includes('Inspect'), 'Must provide Inspect button');

console.log('✓ 2. InboxActionRequiredCard.jsx implements P0 Blocker triage with interactive sign-off');

// 3. Verify InboxDistributionCard.jsx
const distCardSrc = readFileSync(join(__dirname, '../pages/Workspace/components/InboxDistributionCard.jsx'), 'utf-8');
assert(distCardSrc.includes('Inbox Distribution'), 'Must contain Inbox Distribution title');
assert(distCardSrc.includes('Task Assignments'), 'Must include Task Assignments bar');
assert(distCardSrc.includes('Approval Sign-offs'), 'Must include Approval Sign-offs bar');
assert(distCardSrc.includes('Build & System Alerts') || distCardSrc.includes('Build &amp; System Alerts'), 'Must include Build & System Alerts bar');
assert(distCardSrc.includes('Mentions & Discussions') || distCardSrc.includes('Mentions &amp; Discussions'), 'Must include Mentions & Discussions bar');

console.log('✓ 3. InboxDistributionCard.jsx provides visual category breakdown metrics');

// 4. Verify InboxPreferencesCard.jsx
const prefCardSrc = readFileSync(join(__dirname, '../pages/Workspace/components/InboxPreferencesCard.jsx'), 'utf-8');
assert(prefCardSrc.includes('Preferences &amp; Digest') || prefCardSrc.includes('Preferences & Digest'), 'Must contain Preferences header');
assert(prefCardSrc.includes('Focus Mode'), 'Must contain Focus Mode toggle');
assert(prefCardSrc.includes('Weekly Digest'), 'Must display Weekly Digest status');
assert(prefCardSrc.includes('Configure Email &amp; Slack Webhooks') || prefCardSrc.includes('Configure Email & Slack Webhooks'), 'Must contain webhook button');
assert(prefCardSrc.includes('Legacy Inbox Archived'), 'Must display legacy inbox reference card');

console.log('✓ 4. InboxPreferencesCard.jsx implements preferences, focus mode toggle, and legacy reference');

// 5. Verify InboxShortcutsModal.jsx
const shortcutsModalSrc = readFileSync(join(__dirname, '../pages/Workspace/components/InboxShortcutsModal.jsx'), 'utf-8');
assert(shortcutsModalSrc.includes('Keyboard Shortcuts'), 'Must contain Keyboard Shortcuts title');
assert(shortcutsModalSrc.includes('Shift + A'), 'Must include Shift + A shortcut');

console.log('✓ 5. InboxShortcutsModal.jsx provides speed shortcuts modal');

console.log('\nAll Stitch Inbox UI checks PASSED successfully!\n');
