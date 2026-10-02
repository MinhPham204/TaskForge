/**
 * TaskForge - Task Attention Flag Helper
 * 
 * Rules defined in frontend/REFACTOR_UI_PLAN.md & Plan 10:
 * - A single attention flag per task item to prevent visual noise.
 * - Strict precedence order: blocked -> overdue -> needs approval -> urgent.
 * - If task is COMPLETED or CANCELLED, neither overdue nor urgent should trigger.
 */

export const ATTENTION_TYPES = {
  BLOCKED: 'BLOCKED',
  OVERDUE: 'OVERDUE',
  NEEDS_APPROVAL: 'NEEDS_APPROVAL',
  URGENT: 'URGENT',
};

export const ATTENTION_STYLES = {
  danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
};

/**
 * Checks whether a task's due date is overdue.
 * @param {string|Date|null} dueAt 
 * @param {string} [semanticCategory]
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
export const isTaskOverdue = (dueAt, semanticCategory, referenceDate = new Date()) => {
  if (!dueAt) return false;
  const category = (semanticCategory || '').toUpperCase();
  if (category === 'COMPLETED' || category === 'CANCELLED') return false;

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;

  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  const target = new Date(due);
  target.setHours(0, 0, 0, 0);

  return target.getTime() < ref.getTime();
};

/**
 * Calculates days difference between due date and reference date (default: today).
 * Negative means overdue.
 * @param {string|Date|null} dueAt 
 * @param {Date} [referenceDate] 
 * @returns {number|null}
 */
export const getDaysUntilDue = (dueAt, referenceDate = new Date()) => {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  const target = new Date(due);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Evaluates the single most urgent attention flag for a given task.
 * 
 * Precedence:
 * 1. Blocked (danger)
 * 2. Overdue (danger)
 * 3. Needs Approval (warning)
 * 4. Urgent priority (danger, only if not completed)
 * 
 * @param {Object} task 
 * @param {Date} [referenceDate]
 * @returns {{ type: string, label: string, tone: 'danger'|'warning', className: string } | null}
 */
export const getTaskAttentionFlag = (task, referenceDate = new Date(), options = {}) => {
  if (!task) return null;

  const { includeOverdue = true } = options;
  const category = (task.semanticCategory || '').toUpperCase();
  const isTerminal = category === 'COMPLETED' || category === 'CANCELLED';

  // 1. Blocked
  if (task.isBlocked || task.blocked) {
    return {
      type: ATTENTION_TYPES.BLOCKED,
      label: 'Blocked',
      tone: 'danger',
      className: ATTENTION_STYLES.danger,
    };
  }

  // 2. Overdue (only for non-terminal tasks and when includeOverdue is true)
  const dueStr = task.dueAt || task.dueDate;
  if (includeOverdue && !isTerminal && dueStr && isTaskOverdue(dueStr, category, referenceDate)) {
    const diff = getDaysUntilDue(dueStr, referenceDate);
    const label = diff !== null && diff < 0 ? `Overdue (${Math.abs(diff)}d)` : 'Overdue';
    return {
      type: ATTENTION_TYPES.OVERDUE,
      label,
      tone: 'danger',
      className: ATTENTION_STYLES.danger,
    };
  }

  // 3. Needs Approval
  const hasPendingApproval =
    task.hasPendingApproval === true ||
    Boolean(task.pendingApproval) ||
    (task.approvalState && String(task.approvalState).toUpperCase() === 'PENDING') ||
    (task.requiresApproval && task.approvalRequired && !task.approvedAt);

  if (hasPendingApproval) {
    return {
      type: ATTENTION_TYPES.NEEDS_APPROVAL,
      label: 'Needs Approval',
      tone: 'warning',
      className: ATTENTION_STYLES.warning,
    };
  }

  // 4. Urgent priority (only for non-terminal tasks)
  const priority = String(task.priorityCode || '').toUpperCase();
  if (!isTerminal && priority === 'URGENT') {
    return {
      type: ATTENTION_TYPES.URGENT,
      label: 'Urgent',
      tone: 'danger',
      className: ATTENTION_STYLES.danger,
    };
  }

  return null;
};
