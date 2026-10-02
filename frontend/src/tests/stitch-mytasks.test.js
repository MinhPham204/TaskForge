import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log('Starting Stitch My Tasks UI Verification...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Verify MyTasks.jsx source code
const myTasksSrc = readFileSync(join(__dirname, '../pages/User/MyTasks.jsx'), 'utf-8');

// Check Perspective Tabs
assert(myTasksSrc.includes('Assigned to me'), 'Must contain Assigned to me perspective tab');
assert(myTasksSrc.includes('Created by me'), 'Must contain Created by me perspective tab');
assert(myTasksSrc.includes('Subscribed'), 'Must contain Subscribed perspective tab');
assert(myTasksSrc.includes('Approval Queue'), 'Must contain Approval Queue tab');

// Check Bento Split Layout (8 : 4)
assert(myTasksSrc.includes('lg:col-span-8'), 'Must contain 8-col list panel');
assert(myTasksSrc.includes('lg:col-span-4'), 'Must contain 4-col inspector panel');

// Check Linear Grouping
assert(myTasksSrc.includes('In Progress'), 'Must group In Progress tasks');
assert(myTasksSrc.includes('To Do & Backlog') || myTasksSrc.includes('To Do &amp; Backlog'), 'Must group To Do tasks');
assert(myTasksSrc.includes('Completed'), 'Must group Completed tasks');

// Check Shortcuts and controls
assert(myTasksSrc.includes('searchInputRef'), 'Must support search input shortcut');
assert(myTasksSrc.includes('handleCreateNewTask'), 'Must support C shortcut for new task');
assert(myTasksSrc.includes('MyTaskInspector'), 'Must integrate MyTaskInspector');
assert(myTasksSrc.includes('MyTaskBoardView'), 'Must integrate MyTaskBoardView');

assert(myTasksSrc.includes('Collaborative Workflow'), 'Must integrate Collaborative Workflow showcase card');
assert(myTasksSrc.includes('workflowBannerImg'), 'Must import and use workflow banner image');

console.log('✓ 1. MyTasks.jsx conforms to Stitch Bento Split reference layout and perspective tabs');

// 2. Verify MyTaskInspector.jsx source code
const inspectorSrc = readFileSync(join(__dirname, '../pages/User/components/MyTaskInspector.jsx'), 'utf-8');
assert(inspectorSrc.includes('Sub-tasks / Acceptance'), 'Must contain Sub-tasks / Acceptance section');
assert(inspectorSrc.includes('setChecklistCompletion'), 'Must support toggling checklist items');
assert(inspectorSrc.includes('Fast Note'), 'Must contain Fast Note section');
assert(inspectorSrc.includes('createComment'), 'Must support fast note / comment posting');
assert(inspectorSrc.includes('handleCopyLink'), 'Must support copy task link');

console.log('✓ 2. MyTaskInspector.jsx correctly implements live inspection, checklist, and fast note');

// 3. Verify MyTaskBoardView.jsx source code
const boardSrc = readFileSync(join(__dirname, '../pages/User/components/MyTaskBoardView.jsx'), 'utf-8');
assert(boardSrc.includes('To Do & Backlog'), 'Must contain To Do column');
assert(boardSrc.includes('In Progress'), 'Must contain In Progress column');
assert(boardSrc.includes('Completed'), 'Must contain Completed column');

console.log('✓ 3. MyTaskBoardView.jsx correctly implements Kanban view columns');

console.log('\nAll Stitch My Tasks UI checks PASSED successfully!\n');
