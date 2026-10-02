import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

console.log('Starting Shared Semantic Micro-Components (P10-02) verification...\n');

const tempOutFile = path.resolve('src/tests/.tmp-task-components.mjs');

try {
  esbuild.buildSync({
    entryPoints: ['src/components/task/index.js'],
    bundle: true,
    format: 'esm',
    external: ['react', 'react-dom', 'react-icons/*'],
    outfile: tempOutFile,
  });

  const {
    StatusText,
    STATUS_DOT_COLORS,
    STATUS_DEFAULT_LABELS,
    PriorityText,
    PRIORITY_CONFIG,
    AttentionFlag,
    CountText,
    TaskMeta,
  } = await import(`file://${tempOutFile}?t=${Date.now()}`);

  // -------------------------------------------------------------
  // 1. StatusText Tests
  // -------------------------------------------------------------
  console.log('Testing StatusText component...');

  // Default label mapping & dot color
  const htmlNotStarted = renderToStaticMarkup(React.createElement(StatusText, { category: 'NOT_STARTED' }));
  assert(htmlNotStarted.includes('To Do'), 'Should map NOT_STARTED to friendly label "To Do"');
  assert(htmlNotStarted.includes('bg-slate-400'), 'Should contain slate dot color');
  assert(htmlNotStarted.includes('rounded-full'), 'Should have rounded-full dot element');

  const htmlInProgress = renderToStaticMarkup(React.createElement(StatusText, { category: 'IN_PROGRESS' }));
  assert(htmlInProgress.includes('In Progress'), 'Should map IN_PROGRESS to friendly label');
  assert(htmlInProgress.includes('bg-blue-500'), 'Should contain blue dot color');

  const htmlCompleted = renderToStaticMarkup(React.createElement(StatusText, { category: 'COMPLETED' }));
  assert(htmlCompleted.includes('Done'), 'Should map COMPLETED to friendly label "Done"');
  assert(htmlCompleted.includes('bg-emerald-500'), 'Should contain emerald dot color');

  // Custom label overrides default label
  const htmlCustomLabel = renderToStaticMarkup(React.createElement(StatusText, { category: 'IN_PROGRESS', label: 'Dev Review' }));
  assert(htmlCustomLabel.includes('Dev Review'), 'Custom label should override default category label');

  // showDot=false hides dot
  const htmlNoDot = renderToStaticMarkup(React.createElement(StatusText, { category: 'IN_PROGRESS', label: 'In Progress', showDot: false }));
  assert(!htmlNoDot.includes('w-2 h-2'), 'Should not render dot when showDot is false');

  console.log('✓ StatusText renders friendly labels with colored dots and no pill badges');

  // -------------------------------------------------------------
  // 2. PriorityText Tests
  // -------------------------------------------------------------
  console.log('Testing PriorityText component...');

  // Urgent active (non-terminal) task -> applies rose alert style
  const htmlUrgentActive = renderToStaticMarkup(
    React.createElement(PriorityText, { priority: 'URGENT', semanticCategory: 'IN_PROGRESS' })
  );
  assert(htmlUrgentActive.includes('Urgent'), 'Should render Urgent label');
  assert(htmlUrgentActive.includes('text-rose-600'), 'Should apply active alert text color for active urgent task');

  // Urgent completed task -> alert color suppressed, uses neutral text
  const htmlUrgentCompleted = renderToStaticMarkup(
    React.createElement(PriorityText, { priority: 'URGENT', semanticCategory: 'COMPLETED' })
  );
  assert(htmlUrgentCompleted.includes('Urgent'), 'Should render Urgent label');
  assert(!htmlUrgentCompleted.includes('text-rose-600'), 'Completed urgent task must NOT use alert red/rose text');
  assert(htmlUrgentCompleted.includes('text-content-muted'), 'Completed urgent task should use neutral muted text');

  // Medium & Low -> neutral text
  const htmlMedium = renderToStaticMarkup(React.createElement(PriorityText, { priority: 'MEDIUM' }));
  assert(htmlMedium.includes('Medium'));
  assert(htmlMedium.includes('text-content-muted'));

  // High -> amber text
  const htmlHigh = renderToStaticMarkup(React.createElement(PriorityText, { priority: 'HIGH' }));
  assert(htmlHigh.includes('High'));
  assert(htmlHigh.includes('text-amber-600'));

  console.log('✓ PriorityText correctly handles subtle icons and conditional urgent styling');

  // -------------------------------------------------------------
  // 3. AttentionFlag Tests
  // -------------------------------------------------------------
  console.log('Testing AttentionFlag component...');

  const refDate = new Date('2026-09-30T12:00:00Z');

  // Blocked task -> danger flag
  const htmlBlocked = renderToStaticMarkup(
    React.createElement(AttentionFlag, {
      task: { title: 'Test Blocked', isBlocked: true },
      referenceDate: refDate,
    })
  );
  assert(htmlBlocked.includes('Blocked'), 'AttentionFlag should render Blocked badge');
  assert(htmlBlocked.includes('bg-rose-50'), 'Tone should be danger');

  // Overdue task with default includeOverdue=false -> omitted to remove AI-ish badge clutter
  const htmlOverdueDefault = renderToStaticMarkup(
    React.createElement(AttentionFlag, {
      task: { title: 'Test Overdue', dueAt: '2026-09-20T00:00:00Z', semanticCategory: 'IN_PROGRESS' },
      referenceDate: refDate,
    })
  );
  assert.equal(htmlOverdueDefault, '', 'Should omit Overdue badge by default to eliminate AI-looking badge clutter');

  // Overdue task with includeOverdue: true -> danger flag
  const htmlOverdue = renderToStaticMarkup(
    React.createElement(AttentionFlag, {
      task: { title: 'Test Overdue', dueAt: '2026-09-20T00:00:00Z', semanticCategory: 'IN_PROGRESS' },
      referenceDate: refDate,
      includeOverdue: true,
    })
  );
  assert(htmlOverdue.includes('Overdue'), 'AttentionFlag should render Overdue badge when includeOverdue is true');
  assert(htmlOverdue.includes('bg-rose-50'), 'Tone should be danger');

  // Needs Approval task -> warning flag
  const htmlApproval = renderToStaticMarkup(
    React.createElement(AttentionFlag, {
      task: { title: 'Test Approval', hasPendingApproval: true, semanticCategory: 'IN_PROGRESS' },
      referenceDate: refDate,
    })
  );
  assert(htmlApproval.includes('Needs Approval'), 'AttentionFlag should render Needs Approval badge');
  assert(htmlApproval.includes('bg-amber-50'), 'Tone should be warning');

  // Normal task -> returns null (zero noise)
  const htmlNormal = renderToStaticMarkup(
    React.createElement(AttentionFlag, {
      task: { title: 'Normal task', semanticCategory: 'IN_PROGRESS', dueAt: '2026-10-15T00:00:00Z' },
      referenceDate: refDate,
    })
  );
  assert.equal(htmlNormal, '', 'Normal tasks must render empty string (null component), zero badge noise');

  console.log('✓ AttentionFlag renders single prominent badge for alerts, and null for normal tasks');

  // -------------------------------------------------------------
  // 4. CountText Tests
  // -------------------------------------------------------------
  console.log('Testing CountText component...');

  const htmlCountParen = renderToStaticMarkup(React.createElement(CountText, { count: 8 }));
  assert.equal(htmlCountParen, '<span class="text-content-muted font-normal text-xs tracking-normal">(8)</span>');

  const htmlCountWithLabel = renderToStaticMarkup(React.createElement(CountText, { count: 12, label: 'tasks' }));
  assert(htmlCountWithLabel.includes('(12 tasks)'));

  const htmlCountBullet = renderToStaticMarkup(React.createElement(CountText, { count: 5, variant: 'bullet', label: 'tasks' }));
  assert(htmlCountBullet.includes('· 5 tasks'));

  const htmlCountNull = renderToStaticMarkup(React.createElement(CountText, { count: null }));
  assert.equal(htmlCountNull, '', 'CountText should render empty for null count');

  console.log('✓ CountText formats counts neutrally without colored pills');

  // -------------------------------------------------------------
  // 5. TaskMeta Tests
  // -------------------------------------------------------------
  console.log('Testing TaskMeta component...');

  // Displays team and due date
  const htmlMeta = renderToStaticMarkup(
    React.createElement(TaskMeta, {
      teamName: 'Core Backend',
      dueAt: '2026-10-15T00:00:00Z',
      assignee: 'Alice',
    })
  );
  assert(htmlMeta.includes('Core Backend'), 'Should include team name');
  assert(htmlMeta.includes('Oct 15'), 'Should format due date');
  assert(htmlMeta.includes('Alice'), 'Should include assignee name');

  // In-flight progress (e.g. 65%) is displayed
  const htmlMetaProgress = renderToStaticMarkup(
    React.createElement(TaskMeta, {
      teamName: 'Design Ops',
      progress: 65,
    })
  );
  assert(htmlMetaProgress.includes('65%'), 'Should display in-flight progress (65%)');

  // 0% and 100% progress are hidden by default per Plan 10 rules
  const htmlMetaZero = renderToStaticMarkup(
    React.createElement(TaskMeta, {
      teamName: 'Design Ops',
      progress: 0,
    })
  );
  assert(!htmlMetaZero.includes('0%'), 'Should hide 0% progress to reduce clutter');

  const htmlMetaComplete = renderToStaticMarkup(
    React.createElement(TaskMeta, {
      teamName: 'Design Ops',
      progress: 100,
    })
  );
  assert(!htmlMetaComplete.includes('100%'), 'Should hide 100% progress to reduce clutter');

  // Overdue task highlights due date in red/rose
  const htmlMetaOverdue = renderToStaticMarkup(
    React.createElement(TaskMeta, {
      dueAt: '2026-09-01T00:00:00Z',
      semanticCategory: 'IN_PROGRESS',
    })
  );
  assert(htmlMetaOverdue.includes('text-rose-600'), 'Overdue task should highlight due date');

  console.log('✓ TaskMeta standardizes metadata row and respects progress visibility rules');

  console.log('\nAll Shared Semantic Micro-Components (P10-02) checks PASSED successfully!');
} finally {
  if (fs.existsSync(tempOutFile)) {
    fs.unlinkSync(tempOutFile);
  }
}
