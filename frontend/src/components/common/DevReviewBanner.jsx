import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  isDevMockActive,
  enableDevMockSession,
  disableDevMockSession,
} from '../../utils/devMockHandler';
import {
  LuSparkles,
  LuFolderKanban,
  LuUsersRound,
  LuX,
  LuExternalLink,
  LuPower,
} from 'react-icons/lu';

const DevReviewBanner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(true);

  if (!import.meta.env.DEV) {
    return null;
  }

  const isMockActive = isDevMockActive();

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
        title="Open Dev Review Helper"
      >
        <LuSparkles className="w-4 h-4" />
        <span className="hidden sm:inline">Dev Review</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-gray-700 backdrop-blur-sm max-w-sm text-xs space-y-2.5 font-sans">
      <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-2">
        <div className="flex items-center gap-1.5 font-bold text-blue-400">
          <LuSparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
          <span>Local Review & Testing Helper</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Minimize"
        >
          <LuX className="w-4 h-4" />
        </button>
      </div>

      {!isMockActive ? (
        <div className="space-y-2">
          <p className="text-gray-300 text-[11px] leading-relaxed">
            Routes are protected by <code className="text-blue-300">PrivateRoute</code>. Enable Mock Session to bypass auth & test UI immediately with canonical data (no backend required).
          </p>
          <button
            type="button"
            onClick={() => enableDevMockSession(dispatch, navigate)}
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow"
          >
            <LuSparkles className="w-3.5 h-3.5 text-yellow-300" />
            Enable Mock Session & View Projects
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-emerald-400 font-medium">
            <span>● Mock Active (Alex Johnson - PM/Owner)</span>
            <button
              type="button"
              onClick={() => disableDevMockSession(dispatch)}
              className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <LuPower className="w-3 h-3" />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className={`px-2.5 py-1.5 rounded text-left transition-colors flex items-center gap-1.5 cursor-pointer ${
                location.pathname === '/projects'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              <LuFolderKanban className="w-3.5 h-3.5" />
              <span>Projects List</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/projects/p-dev-1')}
              className={`px-2.5 py-1.5 rounded text-left transition-colors flex items-center gap-1.5 cursor-pointer ${
                location.pathname === '/projects/p-dev-1'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              <LuExternalLink className="w-3.5 h-3.5" />
              <span>Project Detail</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/teams')}
              className={`px-2.5 py-1.5 rounded text-left transition-colors flex items-center gap-1.5 cursor-pointer ${
                location.pathname === '/teams'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              <LuUsersRound className="w-3.5 h-3.5" />
              <span>Teams List</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/teams/t-dev-1')}
              className={`px-2.5 py-1.5 rounded text-left transition-colors flex items-center gap-1.5 cursor-pointer ${
                location.pathname === '/teams/t-dev-1'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              <LuExternalLink className="w-3.5 h-3.5" />
              <span>Team Detail</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevReviewBanner;
