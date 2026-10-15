import React from 'react';
import { getTaskEditorAccess } from '../../utils/taskCapabilities.js';
import { editorReason } from '../../utils/taskEditor.js';

export default function TaskEditButton({ task, onEditTask }) {
  const access = getTaskEditorAccess(task);
  return <button type="button" disabled={!onEditTask || !access.allowed}
    title={!onEditTask ? 'Editing is unavailable in this view.' : access.allowed ? 'Edit Task' : editorReason(access.reason)}
    onClick={() => { if (onEditTask && access.allowed) onEditTask(task); }}
    className="rounded border border-border bg-surface px-2.5 py-1 text-xs text-content-muted hover:text-content disabled:opacity-50">
    Edit
  </button>;
}
