import React from 'react';
import { fileErrorMessage } from '../../utils/fileOperations.js';

export default function FilePanel({ title, files = [], loading, fetching, error, uploadAllowed, unlinkAllowed, reason, operations, state, projectFiles = false }) {
  const disabled = state.busy || state.blocked || fetching || Boolean(error);
  return <section className="pt-4 border-t border-border space-y-3 text-xs">
    <div className="flex items-center justify-between"><h4 className="font-semibold text-content">{title}{!loading && !error && ` (${files.length})`}</h4>
      <button type="button" disabled={state.busy || fetching} onClick={() => operations.refresh()} className="text-primary disabled:opacity-50">Refresh files</button></div>
    {state.error && <p role="alert" className="text-rose-600">{state.error}</p>}
    {loading ? <p role="status">Loading files…</p> : error ? <div role="alert"><p>Could not load files. {fileErrorMessage(error)}</p><button type="button" onClick={() => operations.refresh()} disabled={state.busy || fetching}>Retry file list</button></div>
      : files.length === 0 ? <p className="text-content-muted">No files attached.</p> : <ul className="space-y-2">{files.map(file => <li key={file.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-surface-muted/50">
        <div className="min-w-0"><p className="truncate font-medium">{file.displayName || file.originalName}</p><p className="text-content-muted">{file.mediaType} · {Math.ceil(file.sizeBytes / 1024)} KB · {file.uploaderName || 'Project member'}{file.createdAt && ` · ${new Date(file.createdAt).toLocaleDateString()}`}</p></div>
        <div className="flex gap-2"><button type="button" disabled={state.busy || fetching} aria-label={`Download ${file.originalName}`} onClick={() => operations.download(file)}>Download</button>
          <button type="button" disabled={disabled || !unlinkAllowed} title={!unlinkAllowed ? reason : 'Remove from this list'} aria-label={`Remove ${file.originalName}`} onClick={() => operations.confirm(file)}>Remove</button></div>
      </li>)}</ul>}
    {state.pending && <p role="status">{state.pending === 'upload' ? 'Uploading and refreshing files…' : state.pending === 'unlink' ? 'Removing and refreshing files…' : 'Downloading…'}</p>}
    {state.blocked && <p role="status">Refresh the file list before changing files.</p>}
    {state.uncertain && <button type="button" disabled={disabled} onClick={() => operations.acknowledge()}>I checked the list; select a file again</button>}
    {!uploadAllowed && <p className="text-content-muted">{reason}</p>}
    <form onSubmit={event => operations.upload(event)} className="flex flex-wrap gap-2 items-center">
      <input type="file" aria-label="Select file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={disabled || !uploadAllowed || state.uncertain} onChange={event => operations.select(event)} />
      {state.file && <span>{state.file.name}</span>}
      {projectFiles && <input aria-label="Display name" maxLength={255} value={state.displayName} disabled={disabled || !uploadAllowed} onChange={event => operations.name(event.target.value)} placeholder="Display name (optional)" className="border border-border rounded p-1 bg-surface" />}
      <button type="submit" disabled={disabled || !uploadAllowed || !state.file || state.uncertain}>Upload file</button>
    </form><p className="text-content-muted">PDF, PNG, JPEG, TXT; maximum 10 MiB.</p>
    {state.confirm && <div role="dialog" aria-label="Confirm file removal" className="p-3 border border-border rounded space-y-2">
      <p>Remove {state.confirm.originalName} from this list?</p><p className="text-content-muted">The file remains available through any other active relation.</p>
      <button type="button" disabled={state.busy} onClick={() => operations.confirm(null)}>Cancel</button>{' '}
      <button type="button" disabled={disabled || !unlinkAllowed} onClick={() => operations.unlink()}>Confirm remove</button>
    </div>}
  </section>;
}
