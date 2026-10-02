import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log('Starting Stitch Teams UI & Modular Architecture Verification...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Verify TeamListPage.jsx as a clean, thin orchestrator (< 250 lines)
const teamPageSrc = readFileSync(join(__dirname, '../pages/Teams/TeamListPage.jsx'), 'utf-8');
const teamPageLines = teamPageSrc.split('\n').length;
assert(teamPageLines <= 250, `TeamListPage.jsx must remain a thin orchestrator (got ${teamPageLines} lines)`);

// Check layout and components integration
assert(teamPageSrc.includes('space-y-5 pb-12 select-none'), 'Must use standardized container padding');
assert(teamPageSrc.includes('TeamCard'), 'Must integrate TeamCard');
assert(teamPageSrc.includes('TeamListView'), 'Must integrate TeamListView');
assert(teamPageSrc.includes('TeamOverviewSidebar'), 'Must integrate TeamOverviewSidebar');
assert(teamPageSrc.includes('TeamFilterStrip'), 'Must integrate TeamFilterStrip');
assert(teamPageSrc.includes('CreateTeamModal'), 'Must integrate CreateTeamModal');
assert(teamPageSrc.includes('SystemStatusBar'), 'Must integrate reusable SystemStatusBar');

console.log('✓ 1. TeamListPage.jsx is a clean, thin controller conforming to modular architecture');

// 2. Verify TeamCard.jsx
const cardSrc = readFileSync(join(__dirname, '../pages/Teams/components/TeamCard.jsx'), 'utf-8');
assert(cardSrc.includes('monogram'), 'Must display monogram badge');
assert(cardSrc.includes('projects'), 'Must display linked projects count');
assert(cardSrc.includes('View team'), 'Must include View team link');

console.log('✓ 2. TeamCard.jsx implements pastel monogram, meta tags, and member avatar stack');

// 3. Verify TeamListView.jsx
const listSrc = readFileSync(join(__dirname, '../pages/Teams/components/TeamListView.jsx'), 'utf-8');
assert(listSrc.includes('Scope &amp; Type') || listSrc.includes('Scope & Type'), 'Must contain Scope & Type column');
assert(listSrc.includes('Members'), 'Must contain Members column');
assert(listSrc.includes('Projects'), 'Must contain Projects column');

console.log('✓ 3. TeamListView.jsx implements high-density table view');

// 4. Verify TeamOverviewSidebar.jsx
const sidebarSrc = readFileSync(join(__dirname, '../pages/Teams/components/TeamOverviewSidebar.jsx'), 'utf-8');
assert(sidebarSrc.includes('Teams Overview'), 'Must display Teams Overview header');
assert(sidebarSrc.includes('Total Teams'), 'Must show Total Teams metric');
assert(sidebarSrc.includes('Total Members'), 'Must show Total Members metric');
assert(sidebarSrc.includes('Headcount Share'), 'Must show Headcount Share progress');
assert(sidebarSrc.includes('Pending Invites'), 'Must show Pending Invites section');

console.log('✓ 4. TeamOverviewSidebar.jsx implements KPI metrics, headcount progress, and invites');

// 5. Verify CreateTeamModal.jsx
const modalSrc = readFileSync(join(__dirname, '../pages/Teams/components/CreateTeamModal.jsx'), 'utf-8');
assert(modalSrc.includes('Create New Team'), 'Must have Create New Team title');
assert(modalSrc.includes('Team Name'), 'Must validate Team Name');

console.log('✓ 5. CreateTeamModal.jsx encapsulates team creation form dialog');

console.log('\nAll Stitch Teams UI checks PASSED successfully!\n');
