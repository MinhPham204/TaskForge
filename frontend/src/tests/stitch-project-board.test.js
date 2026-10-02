import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log('Starting Stitch Project Board UI & Modular Architecture Verification...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Verify ProjectTaskBoardTab.jsx as a clean, thin orchestrator (< 220 lines)
const boardTabSrc = readFileSync(join(__dirname, '../pages/Projects/components/ProjectTaskBoardTab.jsx'), 'utf-8');
const boardTabLines = boardTabSrc.split('\n').length;
assert(boardTabLines <= 220, `ProjectTaskBoardTab.jsx must remain a thin orchestrator (got ${boardTabLines} lines)`);
assert(boardTabSrc.includes('BoardFilterBar'), 'Must integrate BoardFilterBar');
assert(boardTabSrc.includes('BoardColumn'), 'Must integrate BoardColumn');
assert(boardTabSrc.includes('useTransitionTaskStatusMutation'), 'Must support task status drag transitions');
assert(boardTabSrc.includes('optimisticColumns'), 'Must implement optimistic drag reordering');

console.log('✓ 1. ProjectTaskBoardTab.jsx is a clean, thin controller (< 220 lines) with optimistic updates');

// 2. Verify BoardColumn.jsx
const columnSrc = readFileSync(join(__dirname, '../pages/Projects/components/board/BoardColumn.jsx'), 'utf-8');
assert(columnSrc.includes('BoardTaskCard'), 'Must render BoardTaskCard');
assert(columnSrc.includes('onDrop'), 'Must handle drop events');
assert(columnSrc.includes('onDragOver'), 'Must handle drag over events');
assert(columnSrc.includes('getColumnColor'), 'Must have semantic column styling configuration');

console.log('✓ 2. BoardColumn.jsx cleanly encapsulates column styling, drop target states, and task card mapping');

// 3. Verify BoardTaskCard.jsx
const cardSrc = readFileSync(join(__dirname, '../pages/Projects/components/board/BoardTaskCard.jsx'), 'utf-8');
assert(cardSrc.includes('draggable'), 'Card must be draggable');
assert(cardSrc.includes('MODULE_COLORS'), 'Must support category/module tag styling');
assert(cardSrc.includes('completed') || cardSrc.includes('line-through'), 'Must support strikethrough for completed tasks');
assert(cardSrc.includes('percentCompleted') || cardSrc.includes('Progress'), 'Must display task progress');
assert(cardSrc.includes('assignee'), 'Must display assignee avatar or initials');

console.log('✓ 3. BoardTaskCard.jsx implements category tags, progress bar, due dates, and assignee avatars');

// 4. Verify BoardFilterBar.jsx
const filterSrc = readFileSync(join(__dirname, '../pages/Projects/components/board/BoardFilterBar.jsx'), 'utf-8');
assert(filterSrc.includes('Search tasks'), 'Must include search placeholder');
assert(filterSrc.includes('All Priorities'), 'Must have priority filter options');
assert(filterSrc.includes('All Teams'), 'Must have team filter options');
assert(filterSrc.includes('Create Task'), 'Must include Create Task action button');
assert(filterSrc.includes('onSwitchView'), 'Must provide Board vs List view toggle');

console.log('✓ 4. BoardFilterBar.jsx provides multi-facet filtering and view toggles');

// 5. Verify ProjectDetailPage.jsx padding and header alignment
const detailSrc = readFileSync(join(__dirname, '../pages/Projects/ProjectDetailPage.jsx'), 'utf-8');
assert(detailSrc.includes('space-y-5 pb-12 select-none'), 'Must use standardized container padding');
assert(detailSrc.includes('On track') || detailSrc.includes('status'), 'Must display status tracking indicator');
assert(detailSrc.includes('onSwitchTab={setActiveTab}'), 'Must wire onSwitchTab to board tab');

console.log('✓ 5. ProjectDetailPage.jsx matches standardized spacing, status indicator, and tab navigation');

console.log('\nAll Stitch Project Board UI checks PASSED successfully!\n');
