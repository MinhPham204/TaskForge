import assert from 'node:assert/strict';
import axios from 'axios';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
const { store } = await import('../store/index.js');
const { setSessionFromDev, setActiveOrganization } = await import('../store/authSlice.js');
const { taskApi } = await import('../services/taskApi.js');
const { default: client } = await import('../utils/axiosInstance.js');
const { trackBoardMutation } = await import('../services/boardReconciliation.js');
const queryParams = { projectId: 'performance-project' };
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
let boardReads = 0, version = 0;
let read = async () => [{ id: `status-${version}`, tasks: [] }];
let write = async () => { version++; return {}; };
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
client.defaults.adapter = async config => {
  if (config.method !== 'get') return response(config, await write(config));
  boardReads++;
  return response(config, await read(config));
};
store.dispatch(setSessionFromDev({ user: { id: 'performance-user' }, token: 'test', organizations: [{ organizationId: 'performance-org' }, { organizationId: 'other-org' }] }));
store.dispatch(setActiveOrganization('performance-org'));
const subscription = store.dispatch(taskApi.endpoints.getProjectTaskBoard.initiate(queryParams));
const start = () => trackBoardMutation({ store, queryParams,
  mutate: () => store.dispatch(taskApi.endpoints.transitionTaskStatus.initiate({ ...queryParams, taskId: 'task', statusId: 'target' })) });
try {
  await subscription.unwrap();
  // A listener-owned read is reused while pending, not followed by another GET.
  let gate = deferred(), entered = deferred();
  read = async () => { entered.resolve(); await gate.promise; return [{ id: `status-${version}`, tasks: [] }]; };
  let before = boardReads;
  let operation = start();
  await operation.result; await entered.promise;
  const reconciled = operation.read(() => true);
  gate.resolve();
  assert.equal((await reconciled)[0].id, `status-${version}`);
  assert.equal(boardReads - before, 1, 'One post-write GET, not two');

  // The invalidation read may already have finished before reconciliation.
  read = async () => [{ id: `status-${version}`, tasks: [] }];
  before = boardReads; operation = start(); await operation.result;
  const running = store.dispatch(taskApi.util.getRunningQueryThunk('getProjectTaskBoard', queryParams));
  await running?.unwrap();
  await operation.read(() => true);
  assert.equal(boardReads - before, 1, 'Completed post-write data is reused');

  // A read started during the write is stale. Drain it and still await the
  // genuinely post-write snapshot, including RTK delayed invalidation.
  const writeGate = deferred(), writeEntered = deferred(), staleGate = deferred(), staleEntered = deferred();
  write = async () => { writeEntered.resolve(); await writeGate.promise; version++; return {}; };
  let phase = 'stale';
  read = async () => {
    if (phase === 'stale') { const old = version; staleEntered.resolve(); await staleGate.promise; return [{ id: `status-${old}`, tasks: [] }]; }
    return [{ id: `status-${version}`, tasks: [] }];
  };
  before = boardReads; operation = start(); await writeEntered.promise;
  const stale = subscription.refetch(); await staleEntered.promise;
  writeGate.resolve(); await operation.result;
  const fresh = operation.read(() => true);
  phase = 'fresh'; staleGate.resolve(); await stale.unwrap();
  assert.equal((await fresh)[0].id, `status-${version}`);
  assert.equal(boardReads - before, 2, 'Exactly one stale read and one post-write read');

  // Failed fresh reads propagate to the Board lock instead of being hidden
  // behind a second read or a blind mutation retry.
  write = async () => { version++; return {}; };
  gate = deferred(); entered = deferred();
  read = async config => { entered.resolve(); await gate.promise; throw new axios.AxiosError('offline', 'ERR_NETWORK', config); };
  before = boardReads; operation = start(); await operation.result; await entered.promise;
  const failedRead = operation.read(() => true); gate.resolve();
  await assert.rejects(failedRead);
  assert.equal(boardReads - before, 1);

  // A failed/ambiguous command is also reconciled from the listener's read.
  read = async () => [{ id: `status-${version}`, tasks: [] }];
  write = async config => { version++; throw new axios.AxiosError('response lost', 'ECONNABORTED', config); };
  before = boardReads; operation = start(); await assert.rejects(operation.result);
  assert.equal((await operation.read(() => true))[0].id, `status-${version}`);
  assert.equal(boardReads - before, 1);

  // Obsolete views must never start a read in another workspace.
  before = boardReads;
  assert.equal(await operation.read(() => false), undefined);
  assert.equal(boardReads, before);
  console.log('board-reconciliation passed (real store/listener: 1 GET per move, completed-read reuse, stale-read drain, failed reads, lost response, scope cancellation)');
} finally {
  subscription.unsubscribe();
  store.dispatch(taskApi.util.resetApiState());
}
