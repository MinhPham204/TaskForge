// Project tags cover every filter variant, including reads from which a task
// just disappeared. Detail tags stay scoped to the affected task.
export const taskReadTags = ({ projectId, taskId }) => [
  ...(taskId ? [{ type: 'Task', id: taskId }] : []),
  ...['ProjectTaskList', 'ProjectTaskBoard', 'ProjectTaskOverview', 'ProjectTaskReport']
    .map(type => ({ type, id: projectId })),
  'MyTasks',
  'ApprovalQueue',
];

export const taskDetailTags = ({ taskId }) => [{ type: 'Task', id: taskId }];
