import React, { useState } from 'react';
import { LuBell, LuBellOff, LuMail } from 'react-icons/lu';
import modernCleanMinimalistImg from '../../../assets/images/modern_clean_minimalist.png';

const InboxPreferencesCard = ({ userEmail = 'alex@taskforge.dev', onConfigureWebhooks }) => {
  const [focusMode, setFocusMode] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-xl p-4 border border-border shadow-xs space-y-3">
        <h4 className="text-xs font-bold text-content uppercase tracking-wider">
          Preferences &amp; Digest
        </h4>

        {/* Focus Mode / DND */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${focusMode ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-surface-muted text-content-muted'}`}>
              {focusMode ? <LuBellOff className="w-4 h-4" /> : <LuBell className="w-4 h-4" />}
            </div>
            <div className="leading-tight">
              <div className="text-xs font-medium text-content">Focus Mode</div>
              <div className="text-[10px] text-content-muted">
                {focusMode ? 'DND active · alerts muted' : 'DND paused · notifications active'}
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={focusMode}
            onClick={() => setFocusMode(!focusMode)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
              focusMode ? 'bg-primary' : 'bg-surface-muted border border-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transform transition duration-200 ease-in-out mt-0.5 ${
                focusMode ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Weekly Digest */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between text-xs text-content mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <LuMail className="w-3.5 h-3.5 text-content-muted" />
              Weekly Digest
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              Enabled
            </span>
          </div>
          <p className="text-[11px] text-content-muted">
            Delivered every Monday 08:00 AM to{' '}
            <span className="font-mono text-content">{userEmail}</span>
          </p>
        </div>

        {/* Configure Webhooks Button */}
        <button
          type="button"
          onClick={onConfigureWebhooks}
          className="w-full py-1.5 text-center text-xs font-medium text-content-muted hover:text-content bg-surface-muted hover:bg-border/40 rounded-lg transition-colors cursor-pointer"
        >
          Configure Email &amp; Slack Webhooks
        </button>
      </div>

      {/* Legacy Inbox Archived Reference Card */}
      <div className="p-3 rounded-xl bg-surface border border-border shadow-xs flex items-center gap-3">
        <img
          src={modernCleanMinimalistImg}
          alt="Legacy screenshot reference"
          className="w-12 h-10 object-cover rounded shadow-2xs opacity-85 shrink-0 border border-border/50"
        />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-content truncate">
            Legacy Inbox Archived
          </div>
          <div className="text-[10px] text-content-muted truncate">
            Redesigned to modern Linear-grade workflow
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboxPreferencesCard;
