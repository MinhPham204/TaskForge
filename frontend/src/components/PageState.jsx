import { useEffect, useRef } from 'react';
import { LuCircleAlert, LuInbox, LuLoaderCircle, LuX } from 'react-icons/lu';

export const LoadingState = ({ label = 'Loading' }) => (
  <div className="rounded-lg border border-border bg-surface p-6 text-center text-content-muted" role="status" aria-live="polite">
    <LuLoaderCircle className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" aria-hidden="true" />
    <p className="text-sm font-medium text-content">{label}</p>
  </div>
);

export const EmptyState = ({ title, description, action }) => (
  <section className="rounded-xl border border-border bg-surface p-6 text-center">
    <LuInbox className="mx-auto mb-3 h-7 w-7 text-content-muted" aria-hidden="true" />
    <h2 className="text-base font-semibold text-content">{title}</h2>
    {description && <p className="mx-auto mt-2 max-w-md text-sm text-content-muted">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </section>
);

export const ErrorState = ({ title = 'Something went wrong', message, onRetry }) => (
  <section className="rounded-lg border border-danger-border bg-danger-surface p-5" role="alert">
    <div className="flex gap-3">
      <LuCircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger-content" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold text-danger-content">{title}</h2>
        {message && <p className="mt-1 text-sm text-danger-content">{message}</p>}
        {onRetry && <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold text-danger-content underline underline-offset-2">Try again</button>}
      </div>
    </div>
  </section>
);

export const Dialog = ({ open, title, children, onClose, actions }) => {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1} className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="text-lg font-semibold text-content">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-content-muted hover:bg-surface-muted hover:text-content">
            <LuX className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 text-sm text-content-muted">{children}</div>
        {actions && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
};
