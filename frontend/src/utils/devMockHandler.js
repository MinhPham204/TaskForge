import { handleDevMockRbac } from './devMockRbac.js';

/**
 * Dev Mock Handler - Local Development Review & Testing Helper
 * Only active in development mode (`import.meta.env.DEV`) when enabled.
 * Conforms 100% to the canonical PostgreSQL schemas from P3-08a.
 */

const INITIAL_PROJECTS = [
  {
    id: 'p-dev-1',
    name: 'TaskForge SaaS Core Platform',
    description: 'Multi-tenant cloud management portal with PostgreSQL persistence and real-time collaboration.',
    state: 'ACTIVE',
    startDate: '2026-09-01T08:00:00.000Z',
    dueDate: '2026-10-31T18:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    viewer: {
      projectRole: 'PROJECT_MANAGER',
      canManage: true,
    },
  },
  {
    id: 'p-dev-2',
    name: 'Mobile Companion App (iOS & Android)',
    description: 'Native mobile companion for push notifications, task tracking, and quick approval reviews.',
    state: 'DRAFT',
    startDate: '2026-10-01T08:00:00.000Z',
    dueDate: '2026-12-15T18:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    createdAt: '2026-09-03T09:00:00.000Z',
    updatedAt: '2026-09-03T09:00:00.000Z',
    viewer: {
      projectRole: 'PROJECT_MANAGER',
      canManage: true,
    },
  },
  {
    id: 'p-dev-3',
    name: 'Security Audit & Tenant Isolation Certification',
    description: 'Third-party penetration testing and verification of tenant boundaries across all services.',
    state: 'COMPLETED',
    startDate: '2026-08-01T08:00:00.000Z',
    dueDate: '2026-08-30T18:00:00.000Z',
    completedAt: '2026-08-29T14:30:00.000Z',
    archivedAt: null,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-29T14:30:00.000Z',
    viewer: {
      projectRole: 'CONTRIBUTOR',
      canManage: false,
    },
  },
  {
    id: 'p-dev-4',
    name: 'Legacy V1 System Decommission',
    description: 'Retire the superseded v1 persistence runtime and archived data path.',
    state: 'ARCHIVED',
    startDate: '2026-07-01T08:00:00.000Z',
    dueDate: '2026-07-31T18:00:00.000Z',
    completedAt: '2026-07-30T17:00:00.000Z',
    archivedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    viewer: {
      projectRole: 'PROJECT_MANAGER',
      canManage: true,
    },
  },
];

const INITIAL_TEAMS = [
  {
    id: 't-dev-1',
    name: 'General',
    description: 'Default project participants team for all workspace members.',
    createdAt: '2026-09-01T08:00:00.000Z',
    membersCount: 4,
    members: [
      {
        id: 'tm-1',
        membershipId: 'm-dev-1',
        role: 'owner',
        user: { id: 'u-dev-1', name: 'Alex Johnson', email: 'alex@taskforge.dev' },
      },
      {
        id: 'tm-2',
        membershipId: 'm-dev-2',
        role: 'admin',
        user: { id: 'u-dev-2', name: 'Sarah Miller', email: 'sarah@taskforge.dev' },
      },
    ],
  },
  {
    id: 't-dev-2',
    name: 'Frontend Engineering',
    description: 'React, Tailwind CSS v4, and UI/UX design architecture team.',
    createdAt: '2026-09-02T10:00:00.000Z',
    membersCount: 3,
    members: [
      {
        id: 'tm-3',
        membershipId: 'm-dev-1',
        role: 'owner',
        user: { id: 'u-dev-1', name: 'Alex Johnson', email: 'alex@taskforge.dev' },
      },
      {
        id: 'tm-4',
        membershipId: 'm-dev-3',
        role: 'member',
        user: { id: 'u-dev-3', name: 'David Chen', email: 'david@taskforge.dev' },
      },
    ],
  },
  {
    id: 't-dev-3',
    name: 'Backend & Infrastructure',
    description: 'NestJS, TypeORM, PostgreSQL, Redis, and deployment operations.',
    createdAt: '2026-09-02T11:00:00.000Z',
    membersCount: 2,
    members: [
      {
        id: 'tm-5',
        membershipId: 'm-dev-2',
        role: 'admin',
        user: { id: 'u-dev-2', name: 'Sarah Miller', email: 'sarah@taskforge.dev' },
      },
    ],
  },
];

let projectsStore = [...INITIAL_PROJECTS];
let teamsStore = [...INITIAL_TEAMS];

let projectParticipantsStore = {
  'p-dev-1': {
    teams: [INITIAL_TEAMS[0], INITIAL_TEAMS[1]],
    members: [
      {
        organizationMembershipId: 'm-dev-1',
        role: 'PROJECT_MANAGER',
        organizationRole: 'owner',
        addedAt: '2026-09-01T08:00:00.000Z',
        user: {
          id: 'u-dev-1',
          name: 'Alex Johnson (PM)',
          email: 'alex@taskforge.dev',
          profileImageUrl: null,
        },
      },
      {
        organizationMembershipId: 'm-dev-2',
        role: 'CONTRIBUTOR',
        organizationRole: 'admin',
        addedAt: '2026-09-02T09:00:00.000Z',
        user: {
          id: 'u-dev-2',
          name: 'Sarah Miller',
          email: 'sarah@taskforge.dev',
          profileImageUrl: null,
        },
      },
      {
        organizationMembershipId: 'm-dev-3',
        role: 'CONTRIBUTOR',
        organizationRole: 'member',
        addedAt: '2026-09-03T11:00:00.000Z',
        user: {
          id: 'u-dev-3',
          name: 'David Chen',
          email: 'david@taskforge.dev',
          profileImageUrl: null,
        },
      },
    ],
  },
};

let projectStatusesStore = {
  'p-dev-1': [
    { id: 's-dev-1', name: 'Backlog', semanticCategory: 'NOT_STARTED', position: 0 },
    { id: 's-dev-6', name: 'To Do', semanticCategory: 'NOT_STARTED', position: 1 },
    { id: 's-dev-2', name: 'In Progress', semanticCategory: 'IN_PROGRESS', position: 2 },
    { id: 's-dev-3', name: 'Review', semanticCategory: 'REVIEW', position: 3 },
    { id: 's-dev-4', name: 'Completed', semanticCategory: 'COMPLETED', position: 4 },
    { id: 's-dev-5', name: 'Cancelled', semanticCategory: 'CANCELLED', position: 5 },
  ],
};

let projectModulesStore = {
  'p-dev-1': [
    { moduleCode: 'MILESTONES', enabled: true },
    { moduleCode: 'DOCUMENTS', enabled: true },
    { moduleCode: 'FILES', enabled: true },
    { moduleCode: 'RISKS', enabled: false },
  ],
};

let projectTasksStore = {
  'p-dev-1': [
    {
      id: 'task-dev-1',
      projectId: 'p-dev-1',
      owningTeamId: 't-dev-2',
      owningTeamName: 'Frontend Engineering',
      statusId: 's-dev-2',
      statusName: 'In Progress',
      semanticCategory: 'IN_PROGRESS',
      creatorProjectMembershipId: 'm-dev-1',
      title: 'Implement project task board',
      description: 'Review board columns, task cards, and responsive filters.',
      priorityCode: 'HIGH',
      dueAt: '2026-09-15T17:00:00.000Z',
      manualProgress: 60,
      effectiveProgress: 60,
      requiresApproval: false,
      approverProjectMembershipId: null,
      assigneeProjectMembershipIds: ['m-dev-1', 'm-dev-3'],
      createdAt: '2026-09-02T08:00:00.000Z',
      updatedAt: '2026-09-07T08:00:00.000Z',
      checklist: [],
      comments: [],
      approvals: [],
    },
    {
      id: 'task-dev-2',
      projectId: 'p-dev-1',
      owningTeamId: 't-dev-1',
      owningTeamName: 'General',
      statusId: 's-dev-6',
      statusName: 'To Do',
      semanticCategory: 'NOT_STARTED',
      creatorProjectMembershipId: 'm-dev-1',
      title: 'Finalize review acceptance checklist',
      description: 'Capture browser regression coverage for the portfolio flow.',
      priorityCode: 'MEDIUM',
      dueAt: '2026-09-18T17:00:00.000Z',
      manualProgress: 0,
      effectiveProgress: 50,
      requiresApproval: true,
      approverProjectMembershipId: 'm-dev-2',
      assigneeProjectMembershipIds: ['m-dev-1'],
      createdAt: '2026-09-03T08:00:00.000Z',
      updatedAt: '2026-09-06T12:00:00.000Z',
      checklist: [
        {
          id: 'check-dev-1',
          text: 'Verify authenticated project navigation',
          position: 0,
          completedAt: '2026-09-06T10:00:00.000Z',
          completedByProjectMembershipId: 'm-dev-1',
        },
        {
          id: 'check-dev-2',
          text: 'Verify task detail presentation',
          position: 1,
          completedAt: null,
          completedByProjectMembershipId: null,
        },
      ],
      comments: [
        {
          id: 'comment-dev-1',
          authorProjectMembershipId: 'm-dev-1',
          body: 'The review flow is ready for browser verification.',
          editedAt: null,
          createdAt: '2026-09-06T09:30:00.000Z',
        },
      ],
      approvals: [],
    },
    {
      id: 'task-dev-3',
      projectId: 'p-dev-1',
      owningTeamId: 't-dev-3',
      owningTeamName: 'Backend & Infrastructure',
      statusId: 's-dev-4',
      statusName: 'Completed',
      semanticCategory: 'COMPLETED',
      creatorProjectMembershipId: 'm-dev-2',
      title: 'Validate PostgreSQL task read models',
      description: 'Regression coverage for Board, List, detail and workspace queries.',
      priorityCode: 'URGENT',
      dueAt: '2026-09-07T17:00:00.000Z',
      manualProgress: 100,
      effectiveProgress: 100,
      requiresApproval: true,
      approverProjectMembershipId: 'm-dev-1',
      assigneeProjectMembershipIds: ['m-dev-1'],
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-07T16:00:00.000Z',
      checklist: [],
      comments: [],
      approvals: [
        {
          id: 'approval-dev-1',
          requestNumber: 1,
          state: 'APPROVED',
          approverProjectMembershipId: 'm-dev-1',
          requestedAt: '2026-09-06T08:00:00.000Z',
          resolvedAt: '2026-09-07T16:00:00.000Z',
          requestReason: 'Ready for acceptance',
          resolutionReason: 'Verified',
        },
      ],
    },
  ],
};

export const isDevMockActive = () => {
  return (
    import.meta.env?.DEV &&
    localStorage.getItem('taskforge_dev_mock') === 'true'
  );
};

export const enableDevMockSession = (dispatch, navigate) => {
  localStorage.setItem('taskforge_dev_mock', 'true');
  localStorage.setItem('token', 'dev-mock-jwt-token');
  localStorage.setItem('activeOrganizationId', 'org-dev-1');

  const devUser = {
    id: 'u-dev-1',
    name: 'Alex Johnson',
    email: 'alex@taskforge.dev',
    profileImageUrl: null,
  };

  const devOrgs = [
    {
      organizationId: 'org-dev-1',
      name: 'TaskForge HQ (Review Workspace)',
      role: 'owner',
      organizationMembershipId: 'm-dev-1',
    },
  ];

  // Keep the review identity across a hard reload. Without it, PrivateRoute
  // can redirect before the bootstrap effect restores the mock state.
  localStorage.setItem('authUser', JSON.stringify(devUser));

  if (dispatch) {
    dispatch({
      type: 'auth/setSessionFromDev',
      payload: {
        user: devUser,
        organizations: devOrgs,
        activeOrganizationId: 'org-dev-1',
        role: 'owner',
      },
    });
  }

  if (navigate) {
    navigate('/dashboard');
  }
};

export const disableDevMockSession = (dispatch) => {
  localStorage.removeItem('taskforge_dev_mock');
  localStorage.removeItem('token');
  localStorage.removeItem('activeOrganizationId');
  if (dispatch) {
    dispatch({ type: 'auth/clearUser' });
  }
  window.location.href = '/login';
};

/**
 * Intercepts requests in Dev Mock mode to return local in-memory data.
 * Returns null if request is not handled.
 */
export const handleDevMockRequest = async ({ url = '', method = 'get', data = {}, params = {} }) => {
  if (!isDevMockActive()) return null;

  const cleanUrl = url.split('?')[0];
  const m = method.toLowerCase();

  const rbacResult = handleDevMockRbac({ url: cleanUrl, method: m, data });
  if (rbacResult) return rbacResult;

  const filterTasks = (tasks) => tasks.filter((task) => {
    const search = String(params.search || '').trim().toLowerCase();
    return (
      (!search || task.title.toLowerCase().includes(search) || task.description.toLowerCase().includes(search)) &&
      (!params.statusId || task.statusId === params.statusId) &&
      (!params.teamId || task.owningTeamId === params.teamId) &&
      (!params.priorityCode || task.priorityCode === params.priorityCode)
    );
  });

  // 1. Projects List & Create
  if (cleanUrl === '/api/projects') {
    if (m === 'get') {
      return { data: [...projectsStore] };
    }
    if (m === 'post') {
      const newProj = {
        id: `p-dev-${Date.now()}`,
        name: data.name || 'New Project',
        description: data.description || '',
        state: 'DRAFT',
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        completedAt: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewer: {
          projectRole: 'PROJECT_MANAGER',
          canManage: true,
        },
      };
      projectsStore = [newProj, ...projectsStore];
      projectParticipantsStore[newProj.id] = {
        teams: [INITIAL_TEAMS[0]],
        members: [
          {
            organizationMembershipId: 'm-dev-1',
            role: 'PROJECT_MANAGER',
            organizationRole: 'owner',
            addedAt: new Date().toISOString(),
            user: { id: 'u-dev-1', name: 'Alex Johnson (PM)', email: 'alex@taskforge.dev' },
          },
        ],
      };
      projectStatusesStore[newProj.id] = [
        { id: `s-d-${Date.now()}-0`, name: 'Backlog', semanticCategory: 'NOT_STARTED', position: 0 },
        { id: `s-d-${Date.now()}-1`, name: 'To Do', semanticCategory: 'NOT_STARTED', position: 1 },
        { id: `s-d-${Date.now()}-2`, name: 'In Progress', semanticCategory: 'IN_PROGRESS', position: 2 },
        { id: `s-d-${Date.now()}-3`, name: 'Review', semanticCategory: 'REVIEW', position: 3 },
        { id: `s-d-${Date.now()}-4`, name: 'Completed', semanticCategory: 'COMPLETED', position: 4 },
        { id: `s-d-${Date.now()}-5`, name: 'Cancelled', semanticCategory: 'CANCELLED', position: 5 },
      ];
      projectModulesStore[newProj.id] = [
        { moduleCode: 'MILESTONES', enabled: true },
        { moduleCode: 'DOCUMENTS', enabled: true },
        { moduleCode: 'FILES', enabled: true },
        { moduleCode: 'RISKS', enabled: true },
      ];
      return { data: newProj };
    }
  }

  // 2. Project Detail & Update
  const projectDetailMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
  if (projectDetailMatch) {
    const projectId = projectDetailMatch[1];
    let found = projectsStore.find((p) => p.id === projectId);
    if (!found) {
      // Create fallback view if arbitrary UUID passed
      found = { ...INITIAL_PROJECTS[0], id: projectId };
    }
    if (m === 'get') {
      return { data: found };
    }
    if (m === 'patch') {
      found = { ...found, ...data, updatedAt: new Date().toISOString() };
      projectsStore = projectsStore.map((p) => (p.id === projectId ? found : p));
      return { data: found };
    }
  }

  // 3. Project Lifecycle transitions: /api/projects/:projectId/:command
  const lifecycleMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/(activate|complete|reopen|archive|restore)$/);
  if (lifecycleMatch && m === 'post') {
    const projectId = lifecycleMatch[1];
    const command = lifecycleMatch[2];
    const stateMap = {
      activate: 'ACTIVE',
      complete: 'COMPLETED',
      reopen: 'ACTIVE',
      archive: 'ARCHIVED',
      restore: 'ACTIVE',
    };
    const nextState = stateMap[command] || 'ACTIVE';
    projectsStore = projectsStore.map((p) =>
      p.id === projectId
        ? {
            ...p,
            state: nextState,
            completedAt: command === 'complete' ? new Date().toISOString() : null,
            archivedAt: command === 'archive' ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString(),
          }
        : p
    );
    const updated = projectsStore.find((p) => p.id === projectId);
    return { data: updated || { success: true } };
  }

  // 4. Project Participants: Teams & Members
  const projectTeamsMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/teams$/);
  if (projectTeamsMatch) {
    const projectId = projectTeamsMatch[1];
    const list = projectParticipantsStore[projectId]?.teams || [INITIAL_TEAMS[0]];
    if (m === 'get') {
      return { data: list };
    }
    if (m === 'post') {
      const addedTeam = teamsStore.find((t) => t.id === data.teamId) || {
        id: data.teamId,
        name: 'Added Team',
        description: 'New participant team',
        membersCount: 2,
      };
      if (!projectParticipantsStore[projectId]) {
        projectParticipantsStore[projectId] = { teams: [], members: [] };
      }
      projectParticipantsStore[projectId].teams = [
        ...projectParticipantsStore[projectId].teams.filter((t) => t.id !== data.teamId),
        addedTeam,
      ];
      return { data: addedTeam };
    }
  }

  const removeProjectTeamMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/teams\/([a-zA-Z0-9_-]+)$/);
  if (removeProjectTeamMatch && m === 'delete') {
    const projectId = removeProjectTeamMatch[1];
    const teamId = removeProjectTeamMatch[2];
    if (projectParticipantsStore[projectId]) {
      projectParticipantsStore[projectId].teams = projectParticipantsStore[projectId].teams.filter(
        (t) => t.id !== teamId
      );
    }
    return { data: { success: true } };
  }

  const projectMembersMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/members$/);
  if (projectMembersMatch) {
    const projectId = projectMembersMatch[1];
    const list = projectParticipantsStore[projectId]?.members || projectParticipantsStore['p-dev-1'].members;
    if (m === 'get') {
      return { data: list };
    }
    if (m === 'post') {
      const newMember = {
        organizationMembershipId: data.organizationMembershipId || `m-dev-${Date.now()}`,
        role: data.role || 'CONTRIBUTOR',
        organizationRole: 'member',
        addedAt: new Date().toISOString(),
        user: {
          id: `u-dev-${Date.now()}`,
          name: 'Colleague',
          email: 'colleague@taskforge.dev',
          profileImageUrl: null,
        },
      };
      if (!projectParticipantsStore[projectId]) {
        projectParticipantsStore[projectId] = { teams: [], members: [] };
      }
      projectParticipantsStore[projectId].members = [
        ...projectParticipantsStore[projectId].members,
        newMember,
      ];
      return { data: newMember };
    }
  }

  const removeProjectMemberMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/members\/([a-zA-Z0-9_-]+)$/);
  if (removeProjectMemberMatch && m === 'delete') {
    const projectId = removeProjectMemberMatch[1];
    const membershipId = removeProjectMemberMatch[2];
    if (projectParticipantsStore[projectId]) {
      projectParticipantsStore[projectId].members = projectParticipantsStore[projectId].members.filter(
        (mem) => mem.organizationMembershipId !== membershipId
      );
    }
    return { data: { success: true } };
  }

  // 5. Project Statuses
  const projectStatusesMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/statuses$/);
  if (projectStatusesMatch) {
    const projectId = projectStatusesMatch[1];
    const list = projectStatusesStore[projectId] || projectStatusesStore['p-dev-1'];
    if (m === 'get') {
      return { data: list };
    }
    if (m === 'post') {
      const newStatus = {
        id: `s-dev-${Date.now()}`,
        name: data.name,
        semanticCategory: data.semanticCategory,
        position: list.length,
      };
      projectStatusesStore[projectId] = [...list, newStatus];
      return { data: newStatus };
    }
  }

  const statusRenameMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/statuses\/([a-zA-Z0-9_-]+)$/);
  if (statusRenameMatch && m === 'patch') {
    const projectId = statusRenameMatch[1];
    const statusId = statusRenameMatch[2];
    if (projectStatusesStore[projectId]) {
      projectStatusesStore[projectId] = projectStatusesStore[projectId].map((st) =>
        st.id === statusId ? { ...st, name: data.name } : st
      );
    }
    return { data: { success: true } };
  }

  const statusReorderMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/statuses\/([a-zA-Z0-9_-]+)\/reorder$/);
  if (statusReorderMatch && m === 'post') {
    const projectId = statusReorderMatch[1];
    const statusId = statusReorderMatch[2];
    const targetPos = data.position;
    if (projectStatusesStore[projectId]) {
      const current = [...projectStatusesStore[projectId]];
      const itemIndex = current.findIndex((s) => s.id === statusId);
      if (itemIndex > -1) {
        const [moved] = current.splice(itemIndex, 1);
        current.splice(targetPos, 0, moved);
        projectStatusesStore[projectId] = current.map((st, idx) => ({ ...st, position: idx }));
      }
    }
    return { data: { success: true } };
  }

  const statusArchiveMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/statuses\/([a-zA-Z0-9_-]+)\/archive$/);
  if (statusArchiveMatch && m === 'post') {
    const projectId = statusArchiveMatch[1];
    const statusId = statusArchiveMatch[2];
    if (projectStatusesStore[projectId]) {
      projectStatusesStore[projectId] = projectStatusesStore[projectId].filter((s) => s.id !== statusId);
    }
    return { data: { success: true } };
  }

  // 6. Project Modules
  const projectModulesMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/modules$/);
  if (projectModulesMatch) {
    const projectId = projectModulesMatch[1];
    const list = projectModulesStore[projectId] || projectModulesStore['p-dev-1'];
    if (m === 'get') {
      return { data: list };
    }
    if (m === 'post') {
      projectModulesStore[projectId] = list.map((mod) =>
        mod.moduleCode === data.moduleCode ? { ...mod, enabled: Boolean(data.enabled) } : mod
      );
      return { data: { success: true } };
    }
  }

  // 7. PostgreSQL Task read models used by the Project Board/List and Task Center.
  const projectTaskReadMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/tasks\/(board|overview|report)$/);
  if (projectTaskReadMatch && m === 'get') {
    const projectId = projectTaskReadMatch[1];
    const readModel = projectTaskReadMatch[2];
    const tasks = filterTasks(projectTasksStore[projectId] || []);

    if (readModel === 'board') {
      const statuses = projectStatusesStore[projectId] || projectStatusesStore['p-dev-1'];
      return {
        data: statuses.map((status) => ({
          ...status,
          tasks: tasks.filter((task) => task.statusId === status.id),
        })),
      };
    }

    const summary = {
      total: tasks.length,
      completed: tasks.filter((task) => task.semanticCategory === 'COMPLETED').length,
      inProgress: tasks.filter((task) => task.semanticCategory === 'IN_PROGRESS').length,
      notStarted: tasks.filter((task) => task.semanticCategory === 'NOT_STARTED').length,
      averageProgress: tasks.length
        ? Math.round(tasks.reduce((total, task) => total + task.effectiveProgress, 0) / tasks.length)
        : 0,
    };
    if (readModel === 'overview') return { data: summary };

    const workload = projectParticipantsStore[projectId]?.members?.map((member) => ({
      projectMembershipId: member.organizationMembershipId,
      activeTaskCount: tasks.filter((task) => task.assigneeProjectMembershipIds.includes(member.organizationMembershipId)).length,
    })) || [];
    return { data: { summary, workload, tasks } };
  }

  const projectTaskListMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/tasks$/);
  if (projectTaskListMatch && m === 'post') {
    const projectId = projectTaskListMatch[1];
    const statuses = projectStatusesStore[projectId] || projectStatusesStore['p-dev-1'];
    const teams = projectParticipantsStore[projectId]?.teams || projectParticipantsStore['p-dev-1'].teams;
    const status = statuses.find((item) => item.id === data.statusId);
    const team = teams.find((item) => item.id === data.owningTeamId);
    const now = new Date().toISOString();
    const task = {
      id: `task-dev-${Date.now()}`,
      projectId,
      owningTeamId: data.owningTeamId,
      owningTeamName: team?.name || team?.teamName || '',
      statusId: data.statusId,
      statusName: status?.name || '',
      semanticCategory: status?.semanticCategory || 'NOT_STARTED',
      creatorProjectMembershipId: 'm-dev-1',
      title: String(data.title || '').trim(),
      description: data.description || '',
      priorityCode: data.priorityCode || 'MEDIUM',
      dueAt: data.dueAt || null,
      milestoneId: data.milestoneId || null,
      manualProgress: 0,
      effectiveProgress: 0,
      requiresApproval: false,
      approverProjectMembershipId: null,
      assigneeProjectMembershipIds: [],
      createdAt: now,
      updatedAt: now,
      checklist: [],
      comments: [],
      approvals: [],
    };
    projectTasksStore[projectId] = [...(projectTasksStore[projectId] || []), task];
    return { data: task };
  }
  if (projectTaskListMatch && m === 'get') {
    return { data: filterTasks(projectTasksStore[projectTaskListMatch[1]] || []) };
  }

  const projectTaskDetailMatch = cleanUrl.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/tasks\/([a-zA-Z0-9_-]+)$/);
  if (projectTaskDetailMatch && m === 'get') {
    const task = (projectTasksStore[projectTaskDetailMatch[1]] || []).find(
      (candidate) => candidate.id === projectTaskDetailMatch[2]
    );
    return task ? { data: task } : null;
  }

  if (cleanUrl === '/api/tasks/my' && m === 'get') {
    const tasks = Object.values(projectTasksStore).flat().filter(
      (task) => task.assigneeProjectMembershipIds.includes('m-dev-1')
    );
    return { data: filterTasks(tasks) };
  }

  if (cleanUrl === '/api/tasks/approval-queue' && m === 'get') {
    return { data: [] };
  }

  // 8. Teams List & Create
  if (cleanUrl === '/api/teams') {
    if (m === 'get') {
      return { data: [...teamsStore] };
    }
    if (m === 'post') {
      const newTeam = {
        id: `t-dev-${Date.now()}`,
        name: data.name,
        description: data.description || '',
        createdAt: new Date().toISOString(),
        membersCount: 1,
        members: [
          {
            id: `tm-${Date.now()}`,
            membershipId: 'm-dev-1',
            role: 'owner',
            user: { id: 'u-dev-1', name: 'Alex Johnson', email: 'alex@taskforge.dev' },
          },
        ],
      };
      teamsStore = [newTeam, ...teamsStore];
      return { data: newTeam };
    }
  }

  // 8. Team Detail & Update & Archive
  const teamDetailMatch = cleanUrl.match(/^\/api\/teams\/([a-zA-Z0-9_-]+)$/);
  if (teamDetailMatch) {
    const teamId = teamDetailMatch[1];
    let found = teamsStore.find((t) => t.id === teamId) || {
      ...INITIAL_TEAMS[0],
      id: teamId,
    };
    if (m === 'get') {
      return { data: found };
    }
    if (m === 'patch') {
      found = { ...found, ...data };
      teamsStore = teamsStore.map((t) => (t.id === teamId ? found : t));
      return { data: found };
    }
  }

  const teamArchiveMatch = cleanUrl.match(/^\/api\/teams\/([a-zA-Z0-9_-]+)\/archive$/);
  if (teamArchiveMatch && m === 'post') {
    const teamId = teamArchiveMatch[1];
    teamsStore = teamsStore.filter((t) => t.id !== teamId);
    return { data: { success: true } };
  }

  // 9. Auth endpoints in dev mode
  if (cleanUrl === '/api/auth/me') {
    return {
      data: {
        id: 'u-dev-1',
        name: 'Alex Johnson',
        email: 'alex@taskforge.dev',
        profileImageUrl: null,
      },
    };
  }

  if (cleanUrl === '/api/auth/my-organizations') {
    return {
      data: [
        {
          organizationId: 'org-dev-1',
          name: 'TaskForge HQ (Review Workspace)',
          role: 'owner',
          organizationMembershipId: 'm-dev-1',
        },
      ],
    };
  }

  // 10. Dashboard
  if (cleanUrl === '/api/dashboard' && m === 'get') {
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];
    const in3Days = new Date(Date.now() + 3 * 86400000);
    const in3DaysDateStr = in3Days.toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000);

    const focus = {
      total: 3,
      active: 2,
      completed: 1,
      cancelled: 0,
      overdue: 0,
      dueToday: 1,
      upcoming: 1,
    };

    const assignedTasks = [
      {
        id: 'task-dev-1',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Implement project task board',
        priorityCode: 'HIGH',
        dueAt: today.toISOString(),
        statusName: 'In Progress',
        semanticCategory: 'IN_PROGRESS',
        effectiveProgress: 60,
        updatedAt: today.toISOString(),
      },
      {
        id: 'task-dev-2',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Finalize review acceptance checklist',
        priorityCode: 'MEDIUM',
        dueAt: in3Days.toISOString(),
        statusName: 'Backlog',
        semanticCategory: 'NOT_STARTED',
        effectiveProgress: 0,
        updatedAt: yesterday.toISOString(),
      },
      {
        id: 'task-dev-3',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Validate PostgreSQL task read models',
        priorityCode: 'URGENT',
        dueAt: yesterday.toISOString(),
        statusName: 'Done',
        semanticCategory: 'COMPLETED',
        effectiveProgress: 100,
        updatedAt: yesterday.toISOString(),
      },
      {
        id: 'task-dev-4',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Document architecture decision records',
        priorityCode: 'LOW',
        dueAt: in3Days.toISOString(),
        statusName: 'In Review',
        semanticCategory: 'IN_REVIEW',
        effectiveProgress: 85,
        updatedAt: today.toISOString(),
      },
    ];

    const pendingApprovals = [
      {
        id: 'approval-dev-1',
        taskId: 'task-dev-2',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Finalize review acceptance checklist',
        priorityCode: 'MEDIUM',
        dueAt: in3Days.toISOString(),
        requestedAt: yesterday.toISOString(),
      },
    ];

    const recentProjects = projectsStore.slice(0, 6).map((p) => ({
      id: p.id,
      name: p.name,
      state: p.state,
      dueDate: p.dueDate,
      updatedAt: p.updatedAt,
    }));

    const calendarItems = [
      {
        type: 'TASK',
        id: 'task-dev-1',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Implement project task board',
        date: todayDateStr,
        statusCode: 'In Progress',
        priorityCode: 'HIGH',
      },
      {
        type: 'MILESTONE',
        id: 'ms-dev-1',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Phase 8 Experience Milestone',
        date: tomorrowDateStr,
        statusCode: 'PENDING',
      },
      {
        type: 'TASK',
        id: 'task-dev-2',
        projectId: 'p-dev-1',
        projectName: 'TaskForge SaaS Core Platform',
        title: 'Finalize review acceptance checklist',
        date: in3DaysDateStr,
        statusCode: 'Backlog',
        priorityCode: 'MEDIUM',
      },
    ];

    return {
      data: {
        generatedAt: today.toISOString(),
        focus,
        assignedTasks,
        pendingApprovals,
        recentProjects,
        calendarItems,
      },
    };
  }

  // 11. Notifications
  if (cleanUrl === '/api/notifications' && m === 'get') {
    return {
      data: [
        {
          id: 'notif-dev-1',
          typeCode: 'TASK_ASSIGNED',
          title: 'Task Assigned',
          target: {
            resourceType: 'TASK',
            resourceId: 'task-dev-1',
            projectId: 'p-dev-1',
          },
          safePayload: {
            taskTitle: 'Implement project task board',
            projectName: 'TaskForge SaaS Core Platform',
          },
          readAt: null,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'notif-dev-2',
          typeCode: 'APPROVAL_REQUESTED',
          title: 'Approval Requested',
          target: {
            resourceType: 'TASK',
            resourceId: 'task-dev-2',
            projectId: 'p-dev-1',
          },
          safePayload: {
            taskTitle: 'Finalize review acceptance checklist',
            projectName: 'TaskForge SaaS Core Platform',
          },
          readAt: null,
          createdAt: new Date(Date.now() - 7200000).toISOString(),
        },
      ],
    };
  }

  const notifReadMatch = cleanUrl.match(/^\/api\/notifications\/([a-zA-Z0-9_-]+)\/(read|unread)$/);
  if (notifReadMatch && m === 'patch') {
    return { data: { success: true } };
  }

  // 12. Search
  if (cleanUrl === '/api/search' && m === 'get') {
    const q = String(params.query || '').toLowerCase().trim();
    const results = [];
    if (q) {
      for (const p of projectsStore) {
        if (p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))) {
          results.push({
            kind: 'PROJECT',
            id: p.id,
            projectId: p.id,
            title: p.name,
            description: p.description,
            updatedAt: p.updatedAt,
          });
        }
      }
      for (const t of Object.values(projectTasksStore).flat()) {
        if (t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))) {
          results.push({
            kind: 'TASK',
            id: t.id,
            projectId: t.projectId,
            title: t.title,
            description: t.description,
            updatedAt: t.updatedAt,
          });
        }
      }
      for (const tm of teamsStore) {
        if (tm.name.toLowerCase().includes(q) || (tm.description && tm.description.toLowerCase().includes(q))) {
          results.push({
            kind: 'TEAM',
            id: tm.id,
            projectId: null,
            title: tm.name,
            description: tm.description,
            updatedAt: tm.createdAt,
          });
        }
      }
    }
    return {
      data: {
        query: params.query || '',
        results: results.slice(0, Number(params.limit) || 8),
        quickCreate: {
          canCreateProject: true,
          canCreateTeam: true,
          taskProjectIds: ['p-dev-1'],
        },
      },
    };
  }

  // 13. Preferences
  if (cleanUrl === '/api/auth/preferences') {
    if (m === 'get') {
      return {
        data: {
          theme: 'SYSTEM',
          timezone: 'UTC',
          locale: 'en-US',
          weekStart: 'MONDAY',
          inAppNotifications: true,
        },
      };
    }
    if (m === 'patch') {
      return {
        data: {
          theme: 'SYSTEM',
          timezone: 'UTC',
          locale: 'en-US',
          weekStart: 'MONDAY',
          inAppNotifications: true,
          ...data,
        },
      };
    }
  }

  // 14. Workspace Settings & Members
  const orgDetailMatch = cleanUrl.match(/^\/api\/organizations\/([a-zA-Z0-9_-]+)$/);
  if (orgDetailMatch) {
    if (m === 'get') {
      return {
        data: {
          id: 'org-dev-1',
          name: 'TaskForge HQ (Review Workspace)',
          slug: 'taskforge-hq',
          logoUrl: null,
          myRole: 'OWNER',
          owner: {
            id: 'u-dev-1',
            name: 'Alex Johnson',
            email: 'alex@taskforge.dev',
          },
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      };
    }
    if (m === 'patch') {
      return {
        data: {
          id: 'org-dev-1',
          name: data.name || 'TaskForge HQ (Review Workspace)',
          slug: 'taskforge-hq',
          logoUrl: data.logoUrl || null,
          myRole: 'OWNER',
          owner: {
            id: 'u-dev-1',
            name: 'Alex Johnson',
            email: 'alex@taskforge.dev',
          },
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      };
    }
  }

  return null;
};
