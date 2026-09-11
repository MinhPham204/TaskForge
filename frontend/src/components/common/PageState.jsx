import React from 'react';
import { LuTriangleAlert, LuInbox, LuLock, LuRefreshCw } from 'react-icons/lu';

export const LoadingState = ({ message = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div
      role="status"
      aria-label={message}
      className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin mb-4"
    />
    <p className="text-sm font-medium text-gray-600">{message}</p>
  </div>
);

export const ErrorState = ({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while communicating with the server.',
  onRetry,
}) => (
  <div
    role="alert"
    className="bg-red-50 border border-red-200 rounded-lg p-6 my-4 text-red-800"
  >
    <div className="flex items-start gap-3">
      <LuTriangleAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-red-900">{title}</h3>
        <p className="text-xs text-red-700 mt-1 leading-relaxed">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
          >
            <LuRefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        )}
      </div>
    </div>
  </div>
);

export const EmptyState = ({
  icon: Icon = LuInbox,
  title = 'No items found',
  description = 'There are currently no items to display.',
  action,
}) => (
  <div className="bg-white border border-gray-100 rounded-lg p-10 text-center flex flex-col items-center justify-center my-4">
    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-primary mb-3">
      <Icon className="w-6 h-6" />
    </div>
    <h3 className="text-base font-semibold text-gray-800 mb-1">{title}</h3>
    <p className="text-sm text-gray-500 max-w-md mb-5">{description}</p>
    {action && <div>{action}</div>}
  </div>
);

export const PermissionDeniedState = ({
  title = 'Access Restricted',
  message = 'You do not have the required permissions in this workspace to view or manage this resource.',
}) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 my-6 text-center flex flex-col items-center justify-center">
    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-3">
      <LuLock className="w-6 h-6" />
    </div>
    <h3 className="text-base font-semibold text-amber-900 mb-1">{title}</h3>
    <p className="text-sm text-amber-700 max-w-md">{message}</p>
  </div>
);
