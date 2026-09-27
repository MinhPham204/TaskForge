# TaskForge

TaskForge is a web app for managing projects across teams and workspaces. Members can track assigned work, discuss tasks, request approval, and keep project documents and milestones alongside their board.

This is a full-stack portfolio project built with React, NestJS and PostgreSQL. Its main focus is the work behind a shared task board: who can see a project, who can change a task, and what happens when work needs someone else's approval.

## What you can do

| Area | Features in the application |
| --- | --- |
| Workspaces | Create and switch organizations, invite members, manage teams, and suspend or revoke workspace membership. |
| Projects | Add participating teams and members, assign Project Managers, configure task statuses, and manage the project lifecycle. |
| Tasks | Use list and drag-and-drop board views; assign members, set dates and priorities, track progress, maintain checklists, and discuss work in comments. |
| Approval | Choose a designated approver, submit a request, approve or reject it, and review pending requests in an approval queue. |
| Project context | Track milestones and risks, link mitigation tasks, write Markdown wiki documents, and attach files. These four project modules can be enabled or disabled. |
| Personal work | See assigned and overdue work, pending approvals, recent projects, and task/milestone dates on the dashboard. Filter tasks and view project reports or export task data. |
| Navigation and updates | Search projects, tasks and teams with `Ctrl+K` / `Cmd+K`, read project activity, and open notifications in a personal inbox. |
| Account and settings | Register with an email OTP, reset or change a password, edit a profile, choose Light/Dark/System appearance, and save personal preferences. |

These features have API and frontend implementations. That does not mean every browser flow or hosted integration has been verified. The deployment and testing sections below describe those limits.

## How work is organized

A user can belong to more than one organization. Each organization is a separate workspace with its own teams, projects and tasks.

Organization roles (`OWNER`, `ADMIN`, `MEMBER`) govern workspace administration. Project roles (`PROJECT_MANAGER`, `CONTRIBUTOR`) govern work inside a project. Owner/Admin can see the organization's projects, but project management permissions are checked separately. Belonging to a team does not automatically make someone a Project Manager.

Tasks belong to a project and an owning team. An assignee must be an active project member and belong to that team. Each project defines its task statuses; approval requests have their own state and history rather than being another board column.

For example, a contributor can complete a checklist and submit work to the designated approver. The backend checks eligibility and completion rules. Competing approval decisions are serialized, and a failed transaction does not leave a partial decision or audit record.

## Stack and implementation

| Layer | Technology |
| --- | --- |
| Client | React 18, Vite 7, Redux Toolkit / RTK Query, Tailwind CSS 4 |
| API | Node.js 24, TypeScript, NestJS 11, REST and Swagger |
| Database | PostgreSQL 18, TypeORM, versioned migrations |
| Background work | Redis and BullMQ |
| Files | Private MinIO in the local Docker stack; filesystem fallback for development |
| Delivery | Docker Compose, GitHub Actions, Render blueprint |

The API runs as one NestJS application. PostgreSQL is the only application database; MongoDB is no longer part of the runtime.

- Tenant routes validate the user's active organization membership before querying data. Queries use an explicit organization ID, and switching workspaces clears tenant query caches in the client.
- Schema changes run through migrations. The application does not synchronize tables at startup.
- Invitations and approval requests write selected delivery events into a PostgreSQL Outbox in the same transaction as the business change. A dispatcher passes them to BullMQ for processing. Email delivery can still be duplicated if the provider accepts a message immediately before a worker crashes.
- File downloads go through the application's authorization checks. The browser does not receive private object keys.
- Project activity and audit records are separate; audit records are append-only at the database level.

The migrations in [backend/src/database/migrations](backend/src/database/migrations) define the schema. The application modules live under [backend/src/modules](backend/src/modules).

## Run locally

You need Node.js 24, npm, and Docker with Compose. Run backend and frontend commands from their respective directories; there is no root npm workspace command. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

### 1. Install and configure the backend

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

On Linux/macOS, use `cp .env.example .env`. Only copy the example when you do not already have a local configuration.

Edit `backend/.env` before starting anything:

| Variable | Local value or requirement |
| --- | --- |
| `DATABASE_URL` | `postgresql://taskforge:taskforge@localhost:54329/taskforge` |
| `DATABASE_SSL` | `false` for the local PostgreSQL container |
| `DATABASE_SYNCHRONIZE` | `false` |
| `MIGRATION_DATABASE_URL` | Leave empty to use `DATABASE_URL` for migrations. |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379`; leave `REDIS_URL` empty. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_VERIFIED_SECRET` | Set distinct random secrets. |
| `OUTBOX_INVITATION_CREDENTIAL_KEY_BASE64` | A base64-encoded 32-byte key, required when creating invitations. Keep it stable so pending invitation events remain decryptable. |
| `CLIENT_URL` | `http://localhost:5173` |
| `EMAIL_USER` / `EMAIL_PASS` | Gmail address and app password; the current mail service uses Gmail. Required for real registration, password-reset and invitation delivery. |
| All six `MINIO_*` variables | Clear them for filesystem storage. The example contains partial MinIO settings, which must be cleared or completed. |

Generate the Outbox key locally and copy the result into your configuration:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

With MinIO unset, files are written to `backend/uploads/` by default. `STORAGE_LOCAL_ROOT` can override that directory. Never commit credentials or uploaded files.

### 2. Start local infrastructure and the API

Confirm that your database URLs point to the disposable local database before running migrations:

```bash
docker compose -f docker-compose.infrastructure.yml up -d --wait
npm run migration:run
npm run start:dev
```

The infrastructure file starts PostgreSQL on port `54329` and Redis on `6379`. The API listens on `8001` by default.

### 3. Start the frontend

In another terminal, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The API base URL defaults to `http://localhost:8001`. Set `VITE_API_URL` to override it; do not append `/api`, because the client endpoint paths already include that prefix.

Swagger is available at `http://localhost:8001/api/docs`. `/api/health` checks liveness; `/api/health/ready` checks PostgreSQL and Redis.

### Optional demo data

After migrating a disposable local database, run this from `backend/`:

```bash
node --env-file=.env -r ts-node/register -r tsconfig-paths/register src/database/seed/portfolio-seed.ts --confirm-seed
```

This recreates the deterministic demo workspace and creates or updates its demo users, including their passwords. Do not run it against a database whose demo data or matching user accounts you need to preserve.

The accounts are `owner@taskforge.dev`, `pm@taskforge.dev`, `dev@taskforge.dev`, and `designer@taskforge.dev`, all with password `Password123!`. They are local demo credentials, not public deployment credentials.

A useful walkthrough is to open the seeded project as a Project Manager, inspect its participants and statuses, then use a contributor account to work through an assigned task and its approval flow. Compare what each account can see and change.

## Docker and hosted deployment

[docker-compose.prod.yml](docker-compose.prod.yml) defines a local stack with the web client, API, a one-shot migration service, PostgreSQL, Redis and private MinIO. MinIO currently uses a digest-pinned third-party mirror at `ghcr.io/coollabsio/minio`.

Treat this Compose file as a demo topology, not a ready-to-use production configuration. It contains fallback database/JWT/email values. It also does **not** currently pass `OUTBOX_INVITATION_CREDENTIAL_KEY_BASE64` into the API container; invitation support needs that environment mapping. Setting a variable in the root Compose `.env` alone does not inject it into the container.

[render.yaml](render.yaml) defines the Docker API and a static frontend. The API runs migrations in its pre-deploy command. Hosted deployment is being configured; a working public demo URL has not yet been verified for this README.

For the hosted setup:

- Set `DATABASE_URL` to the intended PostgreSQL endpoint. `MIGRATION_DATABASE_URL` is an optional separate migration target; without it, migrations use the runtime URL.
- Keep `DATABASE_SSL=true` and `DATABASE_SSL_REJECT_UNAUTHORIZED=true`. Supply the provider's PEM root CA as `DATABASE_SSL_CA_BASE64` when needed for certificate verification.
- Configure `REDIS_URL`, JWT secrets, Gmail credentials, the Outbox encryption key and `CLIENT_URL` on the API service. The Render manifest currently omits the Outbox key, so add it explicitly.
- Set `VITE_API_URL` on the frontend before building it. This value is embedded in the client bundle.
- Provision persistent storage before relying on hosted uploads. The Render blueprint contains no MinIO service or persistent upload disk. Without MinIO, the API falls back to its local filesystem; uploads are not automatically disabled and should not be treated as durable hosted storage.

## Tests

Checks that do not require a running database, from `backend/`:

```bash
npm run lint:check
npm run typecheck
npm test -- --runInBand
npm run build
```

`lint:check` covers `src/config` and `src/database`, not the entire backend. The separate `lint` script includes auto-fix. `typecheck` uses the build configuration, which excludes test files.

Integration tests use a separate disposable stack: PostgreSQL on `54330`, Redis on `6380`, and MinIO on `9002`. These suites modify and clear test data:

```bash
npm run test:db:up
npm run test:db:migrate
npm run test:critical:postgres
```

The critical suite includes tenant isolation, project permissions, task and approval transitions, transaction rollback, Outbox recovery, file access and seed safeguards. Its explicit suite list is in [run-critical-suite.mjs](backend/scripts/run-critical-suite.mjs). `npm run test:db:down` removes the disposable test containers **and their volumes**.

From `frontend/`:

```bash
npm test
npm run lint
npm run build
```

Frontend tests are Node-based contract and state checks, not a browser E2E suite. The [CI workflow](.github/workflows/verify.yml) runs scoped backend lint, type checking, unit tests, migrations twice, critical integration tests, seed checks and both builds, plus frontend contract tests. A green run does not prove that external email, hosted storage or all browser interactions work.

## Current limits

- The product covers general project coordination. It does not yet have a workflow tailored to a specific industry or team type.
- The calendar displays existing task and milestone dates. It is not a scheduling engine or a Gantt chart.
- Wiki documents have Markdown editing and preview, without collaborative editing or revision history.
- There is no realtime client transport; updates are fetched through HTTP queries.
- Hosted file persistence and a complete authenticated browser walkthrough still need verification.
- The Gmail transport currently disables certificate verification in `EmailService`. This needs hardening before a production-security claim; PostgreSQL's verified TLS configuration does not address SMTP.
- OpenFGA, database RLS, billing and a general-purpose workflow/automation builder are outside the current implementation.

## Repository guide

| Path | Contents |
| --- | --- |
| [backend](backend) | NestJS API, database migrations, workers and integration tests |
| [frontend](frontend) | React application and client contract tests |
| [.github/workflows/verify.yml](.github/workflows/verify.yml) | CI commands and test infrastructure |
| [docs/TASKFORGE_BUSINESS_SCOPE_v0.3.md](docs/TASKFORGE_BUSINESS_SCOPE_v0.3.md) | Accepted business scope |
| [.spec-kit/specs](.spec-kit/specs) | Implementation plans; planned work is not automatically a shipped feature |

See the [backend guide](backend/README.md) for additional commands and the [migration policy](backend/src/database/migrations/README.md) for schema-change conventions. Older design documents describe the retired MongoDB runtime or earlier data models; use current source, configuration and tests to resolve differences.
