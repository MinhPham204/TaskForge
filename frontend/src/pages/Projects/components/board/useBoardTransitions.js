import { useEffect, useReducer, useRef } from 'react';
import { useStore } from 'react-redux';
import { taskApi } from '../../../../services/taskApi';
import { trackBoardMutation } from '../../../../services/boardReconciliation.js';
import { createBoardTransitions, observeBoardTransitions } from '../../../../utils/boardTransitions.js';

const authScope = store => {
  const auth = store.getState().auth;
  return JSON.stringify([auth.user?.id, auth.activeOrganizationId, auth.accessToken]);
};

export default function useBoardTransitions({ queryParams, columns, transition, refetch, isFetching }) {
  const store = useStore();
  const [, update] = useReducer(value => value + 1, 0);
  const controller = useRef(null);
  const pendingRead = useRef(null);
  if (!controller.current) controller.current = createBoardTransitions(update);
  const board = controller.current;
  const auth = store.getState().auth;
  board.configure({ scope: JSON.stringify([authScope(store), queryParams]), columns, isFetching,
    lockKey: JSON.stringify([auth.user?.id, auth.activeOrganizationId, queryParams.projectId]),
    execute: args => {
      const operation = trackBoardMutation({ store, queryParams,
        mutate: () => transition({ projectId: queryParams.projectId, ...args }) });
      pendingRead.current = operation;
      return operation.result;
    },
    read: async (isCurrent, afterMutation) => {
      if (afterMutation && pendingRead.current) return pendingRead.current.read(isCurrent);
      // An invalidation can overlap a pre-command Board read. Finish that read
      // before requesting the authoritative post-command snapshot.
      const running = store.dispatch(taskApi.util.getRunningQueryThunk('getProjectTaskBoard', queryParams));
      try { await running?.unwrap(); } catch { /* Still perform a fresh read. */ }
      if (!isCurrent()) return;
      return refetch().unwrap();
    } });
  useEffect(() => {
    let previous = authScope(store);
    const unobserve = observeBoardTransitions(update);
    const unsubscribe = store.subscribe(() => {
      const current = authScope(store);
      if (current !== previous) { previous = current; board.cancelScope(); }
    });
    return () => { unsubscribe(); unobserve(); board.cancelScope(); };
  }, [store, board]); // authScope reads the current store, never a render snapshot.
  return { board, ...board.snapshot() };
}
