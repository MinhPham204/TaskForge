import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import { DataSource, type EntityManager } from 'typeorm';
import { createPostgresDataSourceOptions } from '../data-source.options';

const DEMO_EMAILS = [
  'owner@taskforge.dev',
  'pm@taskforge.dev',
  'dev@taskforge.dev',
  'designer@taskforge.dev',
  'fullstack@taskforge.dev',
  'qa@taskforge.dev',
];
const SAMPLE_WORKSPACE = 'TaskForge Sample Workspace';

/** Adds samples without deleting data or changing existing accounts. */
export async function addSamplesForExistingAccounts(
  dataSource: DataSource,
  confirmSeed = false,
  createAccounts: false | 'test' | 'local' = false,
) {
  if (!confirmSeed) throw new Error('Explicit --confirm-seed is required.');
  if (createAccounts) {
    const options = dataSource.options;
    const url = new URL('url' in options ? (options.url ?? '') : '');
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.port !== (createAccounts === 'test' ? '54330' : '54329') ||
      url.pathname !==
        (createAccounts === 'test' ? '/taskforge_test' : '/taskforge')
    )
      throw new Error(
        `Creating demo accounts requires the explicit ${createAccounts} database target.`,
      );
  }
  return dataSource.transaction(async (manager) => {
    if (createAccounts) {
      const names = [
        'Alex Morgan',
        'Taylor Swift',
        'Jordan Lee',
        'Morgan Chen',
        'Sam Rivera',
        'Elena Rostova',
      ];
      const passwordHash = hashSync('Password123!', 10);
      for (const [index, email] of DEMO_EMAILS.entries()) {
        await manager.query(
          `INSERT INTO users (email, name, password_hash, email_verified_at)
           VALUES ($1, $2, $3, now()) ON CONFLICT (email) DO NOTHING`,
          [email, names[index], passwordHash],
        );
      }
    }
    const users: Array<{ id: string; email: string }> = await manager.query(
      `SELECT id, lower(email::text) AS email FROM users
       WHERE lower(email::text) = ANY($1::text[]) AND disabled_at IS NULL`,
      [DEMO_EMAILS],
    );
    const missing = DEMO_EMAILS.filter(
      (email) => !users.some((user) => user.email === email),
    );
    if (missing.length)
      throw new Error(
        `Existing active accounts are required: ${missing.join(', ')}`,
      );
    const accounts = DEMO_EMAILS.map(
      (email) => users.find((user) => user.email === email)!,
    );
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      SAMPLE_WORKSPACE,
    ]);
    const [existing] = await manager.query<Array<{ id: string }>>(
      'SELECT id FROM organizations WHERE name = $1',
      [SAMPLE_WORKSPACE],
    );
    if (existing)
      return { created: false, ...(await summary(manager, existing.id)) };

    // Supports the legacy, RBAC bridge and cutover schemas without migrating them.
    const columns: Array<{ table_name: string; column_name: string }> =
      await manager.query(
        `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('organizations', 'organization_memberships')`,
      );
    const hasColumn = (table: string, column: string) =>
      columns.some(
        (row) => row.table_name === table && row.column_name === column,
      );
    const hasPointer = hasColumn('organizations', 'owner_membership_id');
    const hasRoleId = hasColumn('organization_memberships', 'role_id');
    const hasLegacyRole = hasColumn('organization_memberships', 'role');
    if (!hasRoleId && !hasLegacyRole)
      throw new Error('Unrecognized Organization role schema.');

    const organizationId = randomUUID();
    const membershipIds = accounts.map(() => randomUUID());
    await manager.query(
      hasPointer
        ? 'INSERT INTO organizations (id, name, owner_membership_id) VALUES ($1, $2, $3)'
        : 'INSERT INTO organizations (id, name) VALUES ($1, $2)',
      hasPointer
        ? [organizationId, SAMPLE_WORKSPACE, membershipIds[0]]
        : [organizationId, SAMPLE_WORKSPACE],
    );
    const roles: Array<{ id: string; system_code: string }> = hasRoleId
      ? await manager.query(
          'SELECT id, system_code FROM organization_roles WHERE organization_id = $1',
          [organizationId],
        )
      : [];
    for (const [index, account] of accounts.entries()) {
      const code = index === 0 ? 'OWNER' : index === 1 ? 'ADMIN' : 'MEMBER';
      const fields = [
        'id',
        'organization_id',
        'user_id',
        'state',
        'joined_at',
        'state_changed_at',
      ];
      const values: unknown[] = [
        membershipIds[index],
        organizationId,
        account.id,
        'ACTIVE',
        new Date(),
        new Date(),
      ];
      if (hasLegacyRole) {
        fields.push('role');
        values.push(code);
      }
      if (hasRoleId) {
        const role = roles.find((candidate) => candidate.system_code === code);
        if (!role) throw new Error(`Default ${code} role was not provisioned.`);
        fields.push('role_id');
        values.push(role.id);
      }
      await manager.query(
        `INSERT INTO organization_memberships (${fields.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})`,
        values,
      );
    }

    const teamIds: string[] = [];
    for (const name of ['General', 'Engineering', 'Product & Design']) {
      const [{ id }] = await manager.query<Array<{ id: string }>>(
        'INSERT INTO teams (organization_id, name, description) VALUES ($1, $2, $3) RETURNING id',
        [
          organizationId,
          name,
          `Sample ${name} team for the existing demo accounts.`,
        ],
      );
      teamIds.push(id);
      for (const membershipId of membershipIds) {
        await manager.query(
          'INSERT INTO team_members (organization_id, team_id, organization_membership_id, joined_at) VALUES ($1, $2, $3, now())',
          [organizationId, id, membershipId],
        );
      }
    }

    const projectSpecs = [
      {
        name: 'TaskForge — Workspace & RBAC Demo',
        titles: [
          'Review workspace requirements',
          'Create reusable team groups',
          'Implement member invitation flow',
          'Review custom role permissions',
          'Complete dashboard navigation',
          'Verify Contributor task creation',
        ],
      },
      {
        name: 'TaskForge — Product Delivery Demo',
        titles: [
          'Prepare release checklist',
          'Refine responsive task board',
          'Build API integration examples',
          'Review accessibility feedback',
          'Finalize project onboarding',
          'Run end-to-end acceptance checks',
        ],
      },
    ];
    const workflow = [
      ['Backlog', 'NOT_STARTED'],
      ['To Do', 'NOT_STARTED'],
      ['In Progress', 'IN_PROGRESS'],
      ['In Review', 'REVIEW'],
      ['Done', 'COMPLETED'],
      ['Cancelled', 'CANCELLED'],
    ];
    for (const spec of projectSpecs) {
      const [{ id: projectId }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO projects (organization_id, name, description, state, start_date, due_date, created_by_membership_id)
         VALUES ($1, $2, $3, 'ACTIVE', current_date - 7, current_date + 30, $4) RETURNING id`,
        [
          organizationId,
          spec.name,
          'Sample project shared by the existing Owner, PM and Contributor accounts.',
          membershipIds[0],
        ],
      );
      for (const teamId of teamIds) {
        await manager.query(
          'INSERT INTO project_teams (organization_id, project_id, team_id, added_by_membership_id, added_at) VALUES ($1, $2, $3, $4, now())',
          [organizationId, projectId, teamId, membershipIds[0]],
        );
      }
      const projectMembershipIds: string[] = [];
      for (const [index, membershipId] of membershipIds.entries()) {
        const [{ id }] = await manager.query<Array<{ id: string }>>(
          'INSERT INTO project_memberships (organization_id, project_id, organization_membership_id, role, added_at) VALUES ($1, $2, $3, $4, now()) RETURNING id',
          [
            organizationId,
            projectId,
            membershipId,
            index < 2 ? 'PROJECT_MANAGER' : 'CONTRIBUTOR',
          ],
        );
        projectMembershipIds.push(id);
      }
      const statusIds: string[] = [];
      for (const [index, [name, category]] of workflow.entries()) {
        const [{ id }] = await manager.query<Array<{ id: string }>>(
          'INSERT INTO project_task_statuses (organization_id, project_id, name, semantic_category, position) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [organizationId, projectId, name, category, index],
        );
        statusIds.push(id);
      }
      for (const code of ['MILESTONES', 'DOCUMENTS', 'FILES', 'RISKS']) {
        await manager.query(
          'INSERT INTO project_module_settings (organization_id, project_id, module_code, enabled) VALUES ($1, $2, $3, true)',
          [organizationId, projectId, code],
        );
      }
      for (const [index, title] of spec.titles.entries()) {
        const [{ id: taskId }] = await manager.query<Array<{ id: string }>>(
          `INSERT INTO tasks (organization_id, project_id, owning_team_id, status_id, creator_project_membership_id,
           title, description, priority_code, due_at, manual_progress)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 * interval '1 day'), $10) RETURNING id`,
          [
            organizationId,
            projectId,
            teamIds[index % teamIds.length],
            statusIds[index],
            projectMembershipIds[0],
            title,
            'Sample task: coordinate implementation, review the result and confirm acceptance criteria.',
            ['HIGH', 'MEDIUM', 'URGENT', 'HIGH', 'LOW', 'MEDIUM'][index],
            [-2, 1, 3, 2, -1, 7][index],
            [0, 0, 40, 80, 100, 0][index],
          ],
        );
        const assignee = projectMembershipIds[index];
        await manager.query(
          'INSERT INTO task_assignees (organization_id, project_id, task_id, project_membership_id, assigned_by_project_membership_id, assigned_at) VALUES ($1, $2, $3, $4, $5, now())',
          [
            organizationId,
            projectId,
            taskId,
            assignee,
            projectMembershipIds[0],
          ],
        );
        for (const [position, text] of [
          'Implement acceptance criteria',
          'Review and verify the result',
        ].entries()) {
          await manager.query(
            'INSERT INTO task_checklist_items (organization_id, project_id, task_id, text, position, completed_at, completed_by_project_membership_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [
              organizationId,
              projectId,
              taskId,
              text,
              position,
              index === 4 ? new Date() : null,
              index === 4 ? assignee : null,
            ],
          );
        }
      }
    }
    return { created: true, ...(await summary(manager, organizationId)) };
  });
}

async function summary(manager: EntityManager, organizationId: string) {
  const [counts] = await manager.query<
    Array<{ members: number; teams: number; projects: number; tasks: number }>
  >(
    `SELECT
    (SELECT count(*)::int FROM organization_memberships WHERE organization_id = $1) AS members,
    (SELECT count(*)::int FROM teams WHERE organization_id = $1) AS teams,
    (SELECT count(*)::int FROM projects WHERE organization_id = $1) AS projects,
    (SELECT count(*)::int FROM tasks WHERE organization_id = $1) AS tasks`,
    [organizationId],
  );
  return { organizationId, organizationName: SAMPLE_WORKSPACE, ...counts };
}

if (require.main === module) {
  const dataSource = new DataSource(
    createPostgresDataSourceOptions(process.env, 'runtime'),
  );
  void (async () => {
    await dataSource.initialize();
    try {
      console.log(
        JSON.stringify(
          await addSamplesForExistingAccounts(
            dataSource,
            process.argv.includes('--confirm-seed'),
            process.argv.includes('--create-test-accounts')
              ? 'test'
              : process.argv.includes('--create-local-accounts')
                ? 'local'
                : false,
          ),
          null,
          2,
        ),
      );
    } finally {
      await dataSource.destroy();
    }
  })().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Sample seed failed.',
    );
    process.exitCode = 1;
  });
}
