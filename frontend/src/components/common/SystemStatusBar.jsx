import React, { useState, useEffect } from 'react';
import { LuX } from 'react-icons/lu';

const DEFAULT_SHORTCUTS = [
  { key: '?', desc: 'Toggle keyboard shortcuts reference' },
  { key: 'Esc', desc: 'Close dialog or unfocus' },
];

const SystemStatusBar = ({
  statusText = 'Synced / production-us-east-1',
  shortcuts = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const allShortcuts = [...shortcuts, ...DEFAULT_SHORTCUTS];

  return (
    <>
      <aside className="fixed bottom-4 right-4 z-40 select-none">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-surface/90 backdrop-blur-md border border-border text-content-muted px-3 py-1.5 rounded-md shadow-md hover:shadow-lg hover:border-primary/40 text-[11px] font-medium transition-all cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-content font-medium">{statusText}</span>
          <span className="text-border">|</span>
          <span className="text-content-muted">
            Press <kbd className="font-mono bg-surface-muted px-1 py-0.5 rounded text-content border border-border">?</kbd> for shortcuts
          </span>
        </button>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-surface rounded-2xl border border-border p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-content">Keyboard Shortcuts</h3>
                <p className="text-[11px] text-content-muted">Quick speed shortcuts</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-content-muted hover:text-content hover:bg-surface-muted transition-colors cursor-pointer"
              >
                <LuX className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-border/60 text-xs">
              {allShortcuts.map((s) => (
                <div key={s.key + s.desc} className="flex items-center justify-between py-2">
                  <span className="text-content-muted">{s.desc}</span>
                  <kbd className="px-2 py-0.5 font-mono text-[10px] font-semibold bg-surface-muted border border-border rounded text-content shadow-2xs">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SystemStatusBar;
