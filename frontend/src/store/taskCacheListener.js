import { isAnyOf } from '@reduxjs/toolkit';
import { taskApi } from '../services/taskApi.js';
import { collaborationApi } from '../services/collaborationApi.js';
import { dashboardApi } from '../services/dashboardApi.js';
import { projectApi } from '../services/projectApi.js';
import { teamApi } from '../services/teamApi.js';
import { organizationApi } from '../services/organizationApi.js';
import { taskDetailTags, taskReadTags } from '../services/taskCache.js';

export function registerTaskCacheListener(listener) {
  const candidateChanges = new Map([
    ...['addProjectMember', 'removeProjectMember', 'addProjectTeam', 'removeProjectTeam', 'transitionProjectLifecycle'].map(name => [`${projectApi.reducerPath}:${name}`, 'PROJECT']),
    ...['addTeamMember', 'removeTeamMember', 'archiveTeam'].map(name => [`${teamApi.reducerPath}:${name}`, 'TEAM']),
    ...['suspendOrganizationMember', 'revokeOrganizationMember', 'assignOrganizationMemberRole'].map(name => [`${organizationApi.reducerPath}:${name}`, 'WORKSPACE']),
  ]);
  const candidateScope = action => {
    const path = action.type?.split('/')[0];
    return candidateChanges.get(`${path}:${action.meta?.arg?.endpointName}`);
  };
  const scopes = new Map();
  const currentScope = api => {
    const auth = api.getState().auth;
    return `${auth?.user?.id || ''}:${auth?.activeOrganizationId || ''}`;
  };
  listener.startListening({
    matcher: isAnyOf(taskApi.util.resetApiState, collaborationApi.util.resetApiState),
    effect: () => { scopes.clear(); },
  });
  listener.startListening({
    predicate: action => action.meta?.arg?.type === 'mutation' &&
      (action.type === `${taskApi.reducerPath}/executeMutation/pending` ||
       (action.type?.endsWith('/executeMutation/pending') && candidateScope(action)) ||
       (action.type === `${collaborationApi.reducerPath}/executeMutation/pending` &&
        ['uploadTaskAttachment', 'unlinkTaskAttachment', 'uploadProjectFile', 'removeProjectFile'].includes(action.meta.arg.endpointName))),
    effect: (action, api) => { scopes.set(action.meta.requestId, currentScope(api)); },
  });
  const ownsScope = (action, api) => {
    const scope = scopes.get(action.meta.requestId);
    scopes.delete(action.meta.requestId);
    return scope !== undefined && scope === currentScope(api);
  };
  listener.startListening({
    predicate: action => Boolean(candidateScope(action)) && (action.type?.endsWith('/executeMutation/fulfilled') || action.type?.endsWith('/executeMutation/rejected')),
    effect: (action, api) => {
      if (!ownsScope(action, api)) return;
      const scope = candidateScope(action), args = action.meta.arg.originalArgs;
      api.dispatch(taskApi.util.invalidateTags(scope === 'WORKSPACE' ? ['AssignmentCandidates'] : [{ type: 'AssignmentCandidates', id: scope === 'PROJECT' ? `PROJECT:${args.projectId}` : `TEAM:${args.teamId}` }]));
    },
  });
  // Match mutation actions explicitly: query fulfillment must never trigger a
  // refetch loop. Scope ownership is discarded whenever the session cache resets.
  listener.startListening({
    predicate: action => action.meta?.arg?.type === 'mutation' &&
      (action.type === `${taskApi.reducerPath}/executeMutation/fulfilled` ||
       action.type === `${taskApi.reducerPath}/executeMutation/rejected`),
    effect: (action, api) => {
      if (!ownsScope(action, api)) return;
      const { originalArgs, endpointName } = action.meta.arg;
      if (!originalArgs?.projectId) return;
      if (endpointName === 'assignTask' && action.type.endsWith('/rejected')) {
        api.dispatch(taskApi.util.invalidateTags([{ type: 'AssignmentCandidates', id: `PROJECT:${originalArgs.projectId}` }]));
      }
      const comment = ['createComment', 'editComment', 'deleteComment'].includes(endpointName);
      api.dispatch(taskApi.util.invalidateTags(comment ? taskDetailTags(originalArgs) : taskReadTags(originalArgs)));
      api.dispatch(collaborationApi.util.invalidateTags([{ type: 'ProjectActivity', id: originalArgs.projectId }]));
      if (!comment) {
        api.dispatch(dashboardApi.util.invalidateTags(['Dashboard']));
      }
    },
  });
  const attachments = ['uploadTaskAttachment', 'unlinkTaskAttachment', 'uploadProjectFile', 'removeProjectFile'].flatMap(name => [
    collaborationApi.endpoints[name].matchFulfilled,
    collaborationApi.endpoints[name].matchRejected,
  ]);
  listener.startListening({
    matcher: isAnyOf(...attachments),
    effect: (action, api) => {
      if (!ownsScope(action, api)) return;
      const { projectId, taskId } = action.meta.arg.originalArgs;
      api.dispatch(collaborationApi.util.invalidateTags([
        taskId ? { type: 'TaskAttachment', id: taskId } : { type: 'ProjectFile', id: projectId },
        { type: 'ProjectActivity', id: projectId },
      ]));
      // Attachments are a separate read endpoint: only detail needs reconciling,
      // not progress/assignment aggregates or the personal dashboard.
      if (taskId) api.dispatch(taskApi.util.invalidateTags(taskDetailTags(action.meta.arg.originalArgs)));
    },
  });
}
