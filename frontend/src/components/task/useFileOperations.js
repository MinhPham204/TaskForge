import { useEffect, useReducer, useRef } from 'react';
import { useStore } from 'react-redux';
import { collaborationApi } from '../../services/collaborationApi.js';
import { createFileOperations, observeFileOperations } from '../../utils/fileOperations.js';
const sessionScope = store => { const auth = store.getState().auth; return JSON.stringify([auth.user?.id, auth.activeOrganizationId, auth.accessToken]); };
export default function useFileOperations({ queryName, queryArgs, refetch, ...options }) {
  const store = useStore();
  const [, update] = useReducer(value => value + 1, 0);
  const controller = useRef(null);
  if (!controller.current) controller.current = createFileOperations();
  const operations = controller.current;
  operations.configure({ ...options, scope: JSON.stringify([sessionScope(store), queryName, queryArgs]), read: async isCurrent => {
    const running = store.dispatch(collaborationApi.util.getRunningQueryThunk(queryName, queryArgs));
    try { await running?.unwrap(); } catch { /* Retry read below. */ }
    if (!isCurrent()) return;
    return refetch().unwrap();
  } });
  useEffect(() => {
    let previous = sessionScope(store);
    const unobserve = observeFileOperations(update);
    const unsubscribe = store.subscribe(() => { const next = sessionScope(store); if (next !== previous) { previous = next; operations.cancel(); } });
    return () => { unobserve(); unsubscribe(); operations.cancel(); };
  }, [store, operations]);
  return { operations, state: operations.snapshot() };
}
