import React from 'react';
import { LuX } from 'react-icons/lu';

const InboxShortcutsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Shift + A', desc: 'Mark all notifications as read' },
    { key: 'J / K', desc: 'Navigate through notification items' },
    { key: 'E', desc: 'Mark selected item as read/unread' },
    { key: 'A', desc: 'Quick sign-off / approve highlighted pending item' },
    { key: 'Enter / O', desc: 'Open associated task or target resource' },
    { key: '?', desc: 'Toggle keyboard shortcuts reference' },
    { key: 'Esc', desc: 'Close dialog or unfocus' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold text-content">Keyboard Shortcuts</h3>
            <p className="text-xs text-content-muted">
              Linear-grade speed shortcuts for rapid triage
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-content-muted hover:text-content hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <LuX className="w-5 h-5" />
          </button>
        </div>

        <div className="divide-y divide-border/60">
          {shortcuts.map((sc) => (
            <div key={sc.key} className="flex items-center justify-between py-2 text-xs">
              <span className="text-content-muted">{sc.desc}</span>
              <kbd className="px-2 py-0.5 font-mono text-[11px] font-semibold bg-surface-muted border border-border rounded text-content shadow-2xs">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default InboxShortcutsModal;
