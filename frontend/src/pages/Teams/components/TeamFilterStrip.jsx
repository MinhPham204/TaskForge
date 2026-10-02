import React from 'react';
import { LuSearch } from 'react-icons/lu';

const TeamFilterStrip = ({
  tabs = [],
  activeTab = 'ALL',
  onTabChange,
  searchQuery = '',
  onSearchChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
      {/* Tabs */}
      <div className="flex items-center space-x-1 text-xs overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'font-semibold text-content border-b-2 border-primary -mb-3'
                : 'text-content-muted hover:text-content'
            }`}
          >
            <span>{tab.label}</span>
            <span className="ml-1.5 text-[11px] font-mono text-content-muted bg-surface-muted px-1.5 py-0.5 rounded border border-border/40">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Team Search Filter */}
      <div className="relative w-full sm:w-64">
        <LuSearch className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter teams..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded-md text-content placeholder-content-muted focus:outline-none focus:border-primary transition-all"
        />
      </div>
    </div>
  );
};

export default TeamFilterStrip;
