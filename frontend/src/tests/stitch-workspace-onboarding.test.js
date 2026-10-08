import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log('Starting Stitch Workspace Onboarding UI Verification...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Verify WorkspaceOnboarding.jsx
const onboardingSrc = readFileSync(
  join(__dirname, '../pages/Workspace/WorkspaceOnboarding.jsx'),
  'utf-8'
);

// 1. Navbar retention
assert(
  onboardingSrc.includes("import Navbar from '../../components/layouts/Navbar'") ||
    onboardingSrc.includes('import Navbar from'),
  'Must import Navbar'
);
assert(onboardingSrc.includes('<Navbar'), 'Must render Navbar at top of page');

// 2. Canvas glow & Layout
assert(onboardingSrc.includes('canvas-glow'), 'Must include canvas-glow container');
assert(onboardingSrc.includes('Get Started'), 'Must include Get Started badge');
assert(onboardingSrc.includes('Create a workspace'), 'Must include Create a workspace title');

// 3. Workspace identity
assert(onboardingSrc.includes('Workspace identity'), 'Must include Workspace identity section');
assert(onboardingSrc.includes('Workspace Logo'), 'Must include Workspace Logo');
assert(onboardingSrc.includes('getInitials'), 'Must support initials monogram generation');
assert(onboardingSrc.includes('Upload file'), 'Must support file upload trigger');
assert(onboardingSrc.includes('workspace-name'), 'Must include workspace name input');
assert(onboardingSrc.includes('taskforge.dev/'), 'Must include taskforge.dev/ URL slug prefix');
assert(onboardingSrc.includes('URL is available'), 'Must include URL availability indicator');

// 4. Workspace focus options
assert(onboardingSrc.includes('Workspace focus'), 'Must include Workspace focus section');
assert(onboardingSrc.includes('Project & Task Tracking'), 'Must include Project & Task Tracking option');
assert(onboardingSrc.includes('Cross-Functional Collaboration'), 'Must include Cross-Functional Collaboration option');
assert(onboardingSrc.includes('Client & Partner Work'), 'Must include Client & Partner Work option');
assert(onboardingSrc.includes('Operational & Ongoing Workflows'), 'Must include Operational & Ongoing Workflows option');

// 5. Teammates Invite & Domain Auto-Join
assert(onboardingSrc.includes('Invite colleagues'), 'Must include Invite colleagues section');
assert(onboardingSrc.includes('Domain Auto-Join'), 'Must include Domain Auto-Join toggle card');

// 6. Action buttons & Clean workspace creation
assert(onboardingSrc.includes('Cancel'), 'Must provide Cancel button');
assert(onboardingSrc.includes('Create workspace'), 'Must provide Create workspace submit button');
assert(!onboardingSrc.includes('<PendingInvitations'), 'PendingInvitations should not be rendered on onboarding');
assert(onboardingSrc.includes('switch workspaces anytime from the main sidebar'), 'Must render footer note');

console.log('All Stitch Workspace Onboarding UI checks PASSED successfully!\n');
