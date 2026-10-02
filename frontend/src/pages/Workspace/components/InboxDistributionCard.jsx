import React from 'react';

const InboxDistributionCard = ({ distribution = {} }) => {
  const {
    taskAssignments = 5,
    approvalSignoffs = 2,
    systemAlerts = 4,
    mentions = 1,
    total = 12,
  } = distribution;

  const getPercent = (count) => {
    if (!total || total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  const items = [
    {
      label: 'Task Assignments',
      count: taskAssignments,
      percent: getPercent(taskAssignments),
      dotClass: 'bg-indigo-500',
      barClass: 'bg-indigo-500',
    },
    {
      label: 'Approval Sign-offs',
      count: approvalSignoffs,
      percent: getPercent(approvalSignoffs),
      dotClass: 'bg-amber-500',
      barClass: 'bg-amber-500',
    },
    {
      label: 'Build & System Alerts',
      count: systemAlerts,
      percent: getPercent(systemAlerts),
      dotClass: 'bg-violet-500',
      barClass: 'bg-violet-500',
    },
    {
      label: 'Mentions & Discussions',
      count: mentions,
      percent: getPercent(mentions),
      dotClass: 'bg-emerald-500',
      barClass: 'bg-emerald-500',
    },
  ];

  return (
    <div className="bg-surface rounded-xl p-4 border border-border shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-content uppercase tracking-wider">
          Inbox Distribution
        </h4>
        <span className="text-[11px] font-mono text-content-muted">
          {total} items
        </span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-content-muted">
              <span className="flex items-center gap-1.5 font-medium text-content">
                <span className={`w-2 h-2 rounded-full ${item.dotClass}`} />
                {item.label}
              </span>
              <span className="font-mono font-semibold text-content">
                {item.count}
              </span>
            </div>
            <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`${item.barClass} h-1.5 rounded-full transition-all duration-300`}
                style={{ width: `${item.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InboxDistributionCard;
