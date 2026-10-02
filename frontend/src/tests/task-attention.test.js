import assert from 'node:assert/strict';
import {
  getTaskAttentionFlag,
  isTaskOverdue,
  getDaysUntilDue,
  ATTENTION_TYPES,
} from '../utils/taskAttention.js';

console.log('Starting Task Attention Flag (P10-01) verification...\n');

const refDate = new Date('2026-09-30T12:00:00Z');

// 1. Blocked priority over all others
const blockedTask = {
  title: 'Blocked Task',
  isBlocked: true,
  dueAt: '2026-09-20T00:00:00Z', // also overdue
  hasPendingApproval: true,       // also pending approval
  priorityCode: 'URGENT',         // also urgent
  semanticCategory: 'IN_PROGRESS',
};
const blockedFlag = getTaskAttentionFlag(blockedTask, refDate);
assert.equal(blockedFlag?.type, ATTENTION_TYPES.BLOCKED);
assert.equal(blockedFlag?.label, 'Blocked');
assert.equal(blockedFlag?.tone, 'danger');
console.log('✓ 1. Blocked has highest precedence over overdue, approval, urgent');

// 2. Overdue precedence over approval and urgent
const overdueTask = {
  title: 'Overdue Task',
  isBlocked: false,
  dueAt: '2026-09-25T00:00:00Z', // 5 days overdue
  hasPendingApproval: true,
  priorityCode: 'URGENT',
  semanticCategory: 'IN_PROGRESS',
};
const overdueFlag = getTaskAttentionFlag(overdueTask, refDate);
assert.equal(overdueFlag?.type, ATTENTION_TYPES.OVERDUE);
assert.equal(overdueFlag?.tone, 'danger');
assert(overdueFlag?.label.includes('5d'), 'Should format overdue days');
console.log('✓ 2. Overdue has precedence over pending approval and urgent');

// 3. Needs Approval precedence over urgent
const approvalTask = {
  title: 'Approval Task',
  isBlocked: false,
  dueAt: '2026-10-15T00:00:00Z', // future date
  hasPendingApproval: true,
  priorityCode: 'URGENT',
  semanticCategory: 'IN_PROGRESS',
};
const approvalFlag = getTaskAttentionFlag(approvalTask, refDate);
assert.equal(approvalFlag?.type, ATTENTION_TYPES.NEEDS_APPROVAL);
assert.equal(approvalFlag?.tone, 'warning');
assert.equal(approvalFlag?.label, 'Needs Approval');
console.log('✓ 3. Needs Approval has precedence over urgent');

// 4. Urgent flag for non-terminal tasks without other flags
const urgentTask = {
  title: 'Urgent Task',
  isBlocked: false,
  dueAt: '2026-10-15T00:00:00Z',
  hasPendingApproval: false,
  priorityCode: 'URGENT',
  semanticCategory: 'IN_PROGRESS',
};
const urgentFlag = getTaskAttentionFlag(urgentTask, refDate);
assert.equal(urgentFlag?.type, ATTENTION_TYPES.URGENT);
assert.equal(urgentFlag?.tone, 'danger');
assert.equal(urgentFlag?.label, 'Urgent');
console.log('✓ 4. Urgent triggers when no higher flags apply');

// 5. Terminal tasks (COMPLETED / CANCELLED) must NOT show overdue or urgent flags
const completedOverdueUrgentTask = {
  title: 'Completed Task',
  isBlocked: false,
  dueAt: '2026-09-20T00:00:00Z',
  priorityCode: 'URGENT',
  semanticCategory: 'COMPLETED',
};
assert.equal(getTaskAttentionFlag(completedOverdueUrgentTask, refDate), null);

const cancelledTask = {
  title: 'Cancelled Task',
  isBlocked: false,
  dueAt: '2026-09-20T00:00:00Z',
  priorityCode: 'URGENT',
  semanticCategory: 'CANCELLED',
};
assert.equal(getTaskAttentionFlag(cancelledTask, refDate), null);
console.log('✓ 5. Terminal tasks (COMPLETED, CANCELLED) never trigger overdue or urgent flags');

// 6. Normal task returns null (clean, no badge clutter)
const normalTask = {
  title: 'Normal In Progress Task',
  dueAt: '2026-10-05T00:00:00Z',
  priorityCode: 'MEDIUM',
  semanticCategory: 'IN_PROGRESS',
};
assert.equal(getTaskAttentionFlag(normalTask, refDate), null);
console.log('✓ 6. Normal tasks without issues return null (zero visual badge noise)');

// 7. Helper functions
assert.equal(isTaskOverdue('2026-09-29T00:00:00Z', 'IN_PROGRESS', refDate), true);
assert.equal(isTaskOverdue('2026-10-01T00:00:00Z', 'IN_PROGRESS', refDate), false);
assert.equal(isTaskOverdue('2026-09-29T00:00:00Z', 'COMPLETED', refDate), false);
assert.equal(getDaysUntilDue('2026-09-25T00:00:00Z', refDate), -5);
console.log('✓ 7. isTaskOverdue and getDaysUntilDue helpers work accurately');

console.log('\nAll Task Attention Flag (P10-01) checks PASSED successfully!');
