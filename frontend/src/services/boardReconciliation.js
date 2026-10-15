import { taskApi } from './taskApi.js';

// Record reads that started before the write settled. Store subscribers run
// before the cache listener starts its post-write invalidation, so request IDs
// distinguish a fresh read without relying on millisecond timestamps.
export function trackBoardMutation({ store, queryParams, mutate }) {
  const select = taskApi.endpoints.getProjectTaskBoard.select(queryParams);
  const staleReads = new Set();
  let mutation;
  const observe = () => {
    const state = store.getState();
    const status = mutation && state[taskApi.reducerPath].mutations[mutation.requestId]?.status;
    if (status === 'fulfilled' || status === 'rejected') return;
    const requestId = select(state).requestId;
    if (requestId) staleReads.add(requestId);
  };
  observe();
  const unsubscribe = store.subscribe(observe);
  try {
    mutation = mutate();
  } catch (error) {
    unsubscribe();
    throw error;
  }
  return {
    result: mutation.unwrap().finally(unsubscribe),
    read(isCurrent) {
      return new Promise((resolve, reject) => {
        let scheduled = false;
        let unobserve = () => {};
        const finish = (value, error) => {
          unobserve();
          if (error) reject(error); else resolve(value);
        };
        const check = () => {
          scheduled = false;
          if (!isCurrent()) return finish();
          const current = select(store.getState());
          if (current.status === 'pending') return;
          if (current.requestId && !staleReads.has(current.requestId)) {
            if (current.isSuccess) return finish(current.data);
            if (current.isError) return finish(undefined, current.error);
          }
          // The previous read finished, but no post-write read was started.
          // Read query state rather than an old RTK promise: invalidation can
          // start a new request before that old promise has been cleaned up.
          store.dispatch(taskApi.endpoints.getProjectTaskBoard.initiate(queryParams, {
            subscribe: false, forceRefetch: true,
          }));
        };
        const schedule = () => {
          if (!scheduled) { scheduled = true; queueMicrotask(check); }
        };
        // Wait until middleware has processed delayed invalidations before
        // deciding whether another request is actually necessary.
        unobserve = store.subscribe(schedule);
        schedule();
      });
    },
  };
}
