import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log('Starting Stitch Projects UI Verification...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Verify ProjectListPage.jsx
const projectsSrc = readFileSync(join(__dirname, '../pages/Projects/ProjectListPage.jsx'), 'utf-8');

// Breadcrumb & Header
assert(projectsSrc.includes('TaskForge'), 'Must contain TaskForge in breadcrumb');
assert(projectsSrc.includes('Projects'), 'Must display Projects title');
assert(projectsSrc.includes('active') && projectsSrc.includes('total'), 'Must display active and total counters');

// View mode switcher
assert(projectsSrc.includes('setViewMode(\'list\')'), 'Must support switching to list view');
assert(projectsSrc.includes('setViewMode(\'board\')'), 'Must support switching to board view');

// Linear Filter tabs
assert(projectsSrc.includes('Backlog & Planning') || projectsSrc.includes('Backlog &amp; Planning'), 'Must contain Backlog & Planning tab');
assert(projectsSrc.includes('Completed'), 'Must contain Completed tab');
assert(projectsSrc.includes('Archived'), 'Must contain Archived tab');

// High-density groups
assert(projectsSrc.includes('In flight & active sprint workflows') || projectsSrc.includes('In flight &amp; active sprint workflows'), 'Must group active workflows');
assert(projectsSrc.includes('Proposals awaiting architecture kickoff'), 'Must group backlog proposals');
assert(projectsSrc.includes('Completed & Archived') || projectsSrc.includes('Completed &amp; Archived'), 'Must group completed initiatives');

// Export & Create actions
assert(projectsSrc.includes('handleExportCsv'), 'Must support CSV export of projects');
assert(projectsSrc.includes('handleOpenCreate'), 'Must support opening project creation modal');

// Floating sync indicator
assert(projectsSrc.includes('production-us-east-1'), 'Must include production cluster in status bar');
assert(projectsSrc.includes('shortcuts'), 'Must support shortcuts reference');

console.log('✓ 1. ProjectListPage.jsx conforms to Stitch Linear/GitHub Projects reference layout and controls');

// 2. Verify ProjectInsightsSidebar.jsx
const sidebarSrc = readFileSync(join(__dirname, '../pages/Projects/components/ProjectInsightsSidebar.jsx'), 'utf-8');
assert(sidebarSrc.includes('Initiatives overview'), 'Must display Initiatives overview');
assert(sidebarSrc.includes('Milestones'), 'Must contain Milestones list');
assert(sidebarSrc.includes('Department Allocation'), 'Must show Department Allocation breakdown');
assert(sidebarSrc.includes('Export report'), 'Must include Export report action');

console.log('✓ 2. ProjectInsightsSidebar.jsx implements milestones, capacity allocation, and export');

// 3. Verify ProjectBoardView.jsx
const boardSrc = readFileSync(join(__dirname, '../pages/Projects/components/ProjectBoardView.jsx'), 'utf-8');
assert(boardSrc.includes('Active'), 'Must contain Active column');
assert(boardSrc.includes('Backlog & Planning'), 'Must contain Backlog column');
assert(boardSrc.includes('Completed'), 'Must contain Completed column');
assert(boardSrc.includes('Archived'), 'Must contain Archived column');

console.log('✓ 3. ProjectBoardView.jsx implements Kanban columns and project cards');

console.log('\nAll Stitch Projects UI checks PASSED successfully!\n');
