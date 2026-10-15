import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBoardTransitions, boardTransitionMessage } from '../utils/boardTransitions.js';

const event = () => ({ prevented: false, preventDefault() { this.prevented = true; }, dataTransfer: { setData() {} } });
const task = { id: 'a', title: 'Task A', statusId: 'doing', semanticCategory: 'IN_PROGRESS', effectiveProgress: 45,
  capabilities: { transition: { allowed: true } } };
const columns = [{ id: 'doing', tasks: [task, { ...task, id: 'b' }] }, { id: 'done', tasks: [] }];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let writes = 0, reads = 0;
const board = createBoardTransitions();
let config = { scope: 'workspace/project/filter', lockKey: 'workspace/project', columns,
  execute: async () => { writes++; }, read: async () => { reads++; } };
board.configure(config);
// Repeated dragover events in one column must not rerender the whole Board.
let hoverUpdates = 0;
const hoverBoard = createBoardTransitions(() => { hoverUpdates++; });
hoverBoard.configure({ ...config, lockKey: 'hover-test' });
hoverBoard.start(event(), 'a');
const beforeHover = hoverUpdates;
for (let index = 0; index < 100; index++) {
  const hover = event(); hoverBoard.over(hover, 'done');
  assert.equal(hover.prevented, true, 'Every dragover still accepts the drop');
}
assert.equal(hoverUpdates - beforeHover, 1, '100 dragovers in one column cause only one highlight update');
hoverBoard.over(event(), 'doing');
assert.equal(hoverUpdates - beforeHover, 2, 'Entering a different column updates its highlight');
hoverBoard.end();
board.start(event(), 'a'); await board.drop(event(), 'doing');
assert.equal(writes, 0, 'Same-column drop is a no-op');
board.start(event(), 'a'); board.end(); await board.drop(event(), 'done');
assert.equal(writes, 0, 'Cancelled drag cannot drop');
for (const reason of ['TASK_EXECUTION_ACCESS_REQUIRED', 'PROJECT_MEMBERSHIP_REQUIRED', 'PROJECT_READ_ONLY', 'TASK_ARCHIVED', 'TASK_CAPABILITIES_UNAVAILABLE']) {
  const denied = { ...task, capabilities: reason === 'TASK_CAPABILITIES_UNAVAILABLE' ? {} : { transition: { allowed: false, reason } } };
  board.configure({ ...config, columns: [{ id: 'doing', tasks: [denied] }, columns[1]] });
  const e = event(); board.start(e, 'a'); assert.equal(e.prevented, true);
  await board.drop(event(), 'done'); assert.equal(writes, 0);
}
const request = deferred(), refresh = deferred();
board.configure({ ...config, execute: () => { writes++; return request.promise; }, read: () => { reads++; return refresh.promise; } });
board.start(event(), 'a'); const pending = board.drop(event(), 'done');
assert.equal(board.snapshot().busy, true);
board.start(event(), 'b'); await board.drop(event(), 'done'); assert.equal(writes, 1, 'Second request must not race');
assert.equal(columns[0].tasks[0].effectiveProgress, 45, 'No guessed progress/status metadata');
request.resolve(); await Promise.resolve(); assert.equal(board.snapshot().busy, true, 'Lock includes authoritative read');
refresh.resolve(); await pending; assert.equal(board.snapshot().busy, false); assert.equal(reads, 1);
// Denial and a timeout after a committed write both read persisted state once.
for (const error of [{ status: 409, data: { code: 'TASK_CHECKLIST_INCOMPLETE' } }, { status: undefined }]) {
  board.configure({ ...config, execute: async () => { writes++; throw error; } });
  board.start(event(), 'a'); await board.drop(event(), 'done');
  assert.equal(board.snapshot().blocked, false);
  assert.ok(board.snapshot().message.startsWith(boardTransitionMessage(error)));
}
board.configure({ ...config, execute: async () => { throw { status: 403, data: { code: 'TASK_EXECUTION_ACCESS_REQUIRED' } }; }, read: async () => { throw new Error('offline'); } });
board.start(event(), 'a'); await board.drop(event(), 'done');
assert.equal(board.snapshot().blocked, true);
assert.match(board.snapshot().message, /Could not refresh/);
board.configure(config); await board.refresh(); assert.equal(board.snapshot().blocked, false);
// Every view change cancels drag; old success/error/read cannot write new UI.
for (const next of ['new-filter', 'new-project', 'new-workspace', 'original-again']) {
  board.start(event(), 'a'); board.configure({ ...config, scope: next });
  const before = writes; await board.drop(event(), 'done'); assert.equal(writes, before);
  const late = deferred();
  board.configure({ ...config, scope: `${next}-request`, execute: () => { writes++; return late.promise; } });
  board.start(event(), 'a'); const operation = board.drop(event(), 'done');
  const beforeRead = reads;
  board.cancelScope(); board.configure({ ...config, scope: `${next}-return` });
  late.reject({ status: 409, data: { code: 'TASK_APPROVAL_REQUIRED' } }); await operation;
  assert.equal(reads, beforeRead); assert.equal(board.snapshot().message, '');
  assert.equal(board.snapshot().blocked, true); await board.refresh();
}
// A remounted Board shares the in-flight lane and cannot submit a second move.
const old = deferred(); board.configure({ ...config, execute: () => old.promise });
board.start(event(), 'a'); const oldMove = board.drop(event(), 'done'); board.cancelScope();
const remount = createBoardTransitions(); remount.configure(config);
assert.equal(remount.snapshot().busy, true); assert.equal(remount.access(task).allowed, false);
old.resolve(); await oldMove; assert.equal(remount.snapshot().blocked, true); await remount.refresh();
// Scope can change while an earlier query is being drained. Its callback must
// not start an old-view refetch or unblock the current view.
const draining = deferred(); let obsoleteReads = 0;
board.configure({ ...config, scope: 'draining', read: async isCurrent => { await draining.promise; if (isCurrent()) obsoleteReads++; } });
board.start(event(), 'a'); const drainMove = board.drop(event(), 'done'); await Promise.resolve();
board.configure({ ...config, scope: 'changed-during-read' }); draining.resolve(); await drainMove;
assert.equal(obsoleteReads, 0); assert.equal(board.snapshot().blocked, true); await board.refresh();
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { BoardTaskCard: Card } = await server.ssrLoadModule('/src/pages/Projects/components/board/BoardTaskCard.jsx');
  const { BoardColumn: Column } = await server.ssrLoadModule('/src/pages/Projects/components/board/BoardColumn.jsx');
  let moved = false;
  const allowed = Card({ task, onDragStart: () => { moved = true; } });
  assert.equal(allowed.props.draggable, true); allowed.props.onDragStart(event()); assert.equal(moved, true);
  const denied = Card({ task: { ...task, capabilities: { transition: { allowed: false, reason: 'PROJECT_READ_ONLY' } } }, onDragStart: () => assert.fail('Read-only Card') });
  assert.equal(denied.props.draggable, false); denied.props.onDragStart(event());
  assert.equal(Card({ task: { ...task, capabilities: {} }, dragBlocked: false, onDragStart() {} }).props.draggable, false, 'Caller hints cannot grant missing Task capability');
  const html = renderToStaticMarkup(denied); assert.match(html, /read-only/); assert.ok(!html.includes('reorder'));
  const rendered = renderToStaticMarkup(React.createElement(Column, { column: columns[0], dragBlocked: true }));
  assert.match(rendered, /draggable="false"/); assert.match(rendered, /45%/); assert.match(rendered, />2</);
  let dropped;
  Column({ column: columns[1], onDrop: (_event, id) => { dropped = id; } }).props.onDrop(event());
  assert.equal(dropped, 'done', 'Actual Column drop passes its target status');
  for (const [code, text] of Object.entries({ TENANT_MEMBERSHIP_REQUIRED: 'workspace', PROJECT_MEMBERSHIP_REQUIRED: 'Project membership', TASK_EXECUTION_ACCESS_REQUIRED: 'assignee', TASK_TRANSITION_INVALID: 'transition', TASK_CHECKLIST_INCOMPLETE: 'checklist', TASK_APPROVAL_REQUIRED: 'approval', PROJECT_READ_ONLY: 'read-only', TASK_ARCHIVED: 'archived' })) {
    assert.ok(boardTransitionMessage({ status: code.includes('REQUIRED') ? 403 : 409, data: { code } }).includes(text));
  }
  console.log('board-transitions passed (actual Card/Column SSR/events, permission gates, cancellation, serialization, failed/late reads, remount/filter/Project/workspace scopes)');
} finally { await server.close(); }
