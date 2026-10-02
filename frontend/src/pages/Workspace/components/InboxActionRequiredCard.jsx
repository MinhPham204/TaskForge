import React, { useState } from 'react';
import { LuCheck, LuExternalLink, LuSparkles } from 'react-icons/lu';

const InboxActionRequiredCard = ({ onSignOff, onInspect }) => {
  const [signedOff, setSignedOff] = useState(false);

  const handleSignOff = () => {
    setSignedOff(true);
    if (onSignOff) onSignOff();
  };

  return (
    <div className="bg-gradient-to-br from-blue-950 via-zinc-900 to-zinc-950 border border-blue-500/30 rounded-xl p-4 text-white shadow-md relative overflow-hidden">
      <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
      <div className="flex items-center justify-between text-xs text-blue-200 pb-2">
        <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-blue-300">
          <LuSparkles className="w-3 h-3 text-blue-400" />
          Action Required
        </span>
        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white font-mono text-[10px] border border-white/10">
          P0 Blocker
        </span>
      </div>
      <h4 className="text-sm font-semibold tracking-tight text-white mt-1">
        Finalize review acceptance checklist
      </h4>
      <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
        Alex Vance requested your explicit sign-off to proceed with the SaaS Core Platform release.
      </p>
      <div className="mt-4 flex items-center gap-2">
        {signedOff ? (
          <div className="flex-1 py-1.5 px-3 bg-emerald-600/90 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm">
            <LuCheck className="w-3.5 h-3.5" />
            <span>Signed off</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSignOff}
            className="flex-1 py-1.5 px-3 bg-primary hover:bg-blue-600 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm text-center cursor-pointer"
          >
            Sign-off Now
          </button>
        )}
        <button
          type="button"
          onClick={onInspect}
          className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
        >
          <span>Inspect</span>
          <LuExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default InboxActionRequiredCard;
