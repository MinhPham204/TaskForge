export function validateSelectedFile(file) {
  if (!file) return '';
  if (!file.size) return 'File cannot be empty.';
  if (file.size > 10 * 1024 * 1024) return 'File exceeds the 10 MiB limit.';
  if (!['application/pdf', 'image/jpeg', 'image/png', 'text/plain'].includes(file.type)) return 'Only PDF, JPEG, PNG or plain text files are allowed.';
  // eslint-disable-next-line no-control-regex -- Reject control bytes in user file names.
  if (!file.name?.trim() || file.name.trim().length > 255 || /[\\/\x00-\x1f\x7f]/.test(file.name)) return 'File name is invalid.';
  return '';
}

export function fileErrorMessage(error) {
  const data = error?.response?.data || error?.data;
  const mapped = {
    PROJECT_READ_ONLY: 'This Project is read-only. Files can still be viewed and downloaded.',
    TASK_ARCHIVED: 'This Task is archived. File changes are unavailable.',
    PROJECT_MEMBERSHIP_REQUIRED: 'Active Project membership is required to change files.',
    TENANT_MEMBERSHIP_REQUIRED: 'Select a workspace where you have active membership.',
    PROJECT_MANAGER_REQUIRED: 'Only an active Project Manager can change Project files.',
    PROJECT_MODULE_DISABLED: 'Enable the FILES module before uploading a Project file.',
  };
  return mapped[data?.code] || (typeof data?.message === 'string' ? data.message : 'File request failed. Refresh the list and try again.');
}

const pendingScopes = new Map();
const listeners = new Set();
export function observeFileOperations(callback) { listeners.add(callback); return () => listeners.delete(callback); }
const initial = () => ({ file: null, displayName: '', confirm: null, error: '', pending: null, uncertain: false, blocked: false });
export function createFileOperations() {
  let options = {}, scope, generation = 0, state = initial();
  const notify = () => listeners.forEach(callback => callback());
  const busy = () => pendingScopes.has(scope);
  async function refresh(owner, read) {
    try { await read(() => owner === generation); if (owner === generation) state.blocked = false; }
    catch { if (owner === generation) { state.blocked = true; state.error = 'Could not refresh the file list. Retry the read before changing files.'; } }
  }
  async function run(kind, row) {
    if (busy() || (kind !== 'download' && state.blocked)) return;
    if (kind === 'upload' && (!options.uploadAllowed || !state.file || state.uncertain)) return;
    if (kind === 'unlink' && (!options.unlinkAllowed || !row)) return;
    if (kind === 'download' && !options.readAllowed) return;
    const owner = generation, lane = scope, current = options;
    const selected = state.file, displayName = state.displayName;
    const isCurrent = () => owner === generation;
    pendingScopes.set(lane, kind); state.pending = kind; state.error = ''; notify();
    try {
      if (kind === 'upload') await current.upload(selected, displayName);
      else if (kind === 'unlink') await current.unlink(row);
      else await current.download(row, isCurrent);
      if (isCurrent()) { if (kind === 'upload') { state.file = null; state.displayName = ''; } if (kind === 'unlink') state.confirm = null; }
    } catch (error) {
      if (isCurrent()) {
        state.error = fileErrorMessage(error);
        const status = error?.response?.status || error?.status;
        if (kind === 'upload' && (!status || status >= 500)) {
          state.uncertain = true; state.error += ' Check the refreshed list before selecting another upload; retry may create a duplicate.';
        }
      }
    }
    if (kind !== 'download' && isCurrent()) await refresh(owner, current.read);
    if (isCurrent()) state.pending = null;
    pendingScopes.delete(lane); notify();
  }
  return {
    configure(next) { if (next.scope !== scope) { scope = next.scope; generation++; state = initial(); state.blocked = busy(); state.uncertain = pendingScopes.get(scope) === 'upload'; } options = next; },
    cancel() { generation++; state = initial(); state.blocked = busy(); state.uncertain = pendingScopes.get(scope) === 'upload'; notify(); },
    snapshot: () => ({ ...state, busy: busy() }),
    select(event) {
      const file = event.target.files?.[0]; event.target.value = '';
      if (busy() || state.uncertain) return;
      state.error = validateSelectedFile(file); state.file = state.error ? null : (file || null); notify();
    },
    name(value) { if (!busy()) { state.displayName = value; notify(); } },
    confirm(row) { if (!busy()) { state.confirm = row; state.error = ''; notify(); } },
    upload(event) { event?.preventDefault(); return run('upload'); },
    unlink() { return run('unlink', state.confirm); },
    download: row => run('download', row),
    async refresh() { if (busy()) return; const owner = generation; await refresh(owner, options.read); notify(); },
    acknowledge() { if (!busy() && !state.blocked) { state.uncertain = false; state.file = null; state.error = ''; notify(); } },
  };
}
