# TaskForge

TaskForge is a multi-tenant SaaS workspace for planning projects, coordinating teams, and moving tasks through configurable workflows. It is built as an end-to-end portfolio project: the React client, NestJS API, PostgreSQL schema, Redis-backed asynchronous boundaries, private object storage, tests, and deployment manifests evolve together as vertical slices.

> Release status: Phase 7 implementation and verification are complete. The frontend and PostgreSQL API are ready for a controlled deployment; no public demo has been provisioned yet.

## The problem

Generic task lists become difficult to govern once several organizations, teams, and projects share one application. TaskForge models those boundaries explicitly:

- an Organization is the tenant and an active Organization Membership grants workspace access;
- Organization roles (`OWNER`, `ADMIN`, `MEMBER`) and Project roles (`PROJECT_MANAGER`, `CONTRIBUTOR`) are separate scopes;
- Teams group people, while Project Membership determines project permissions;
- each Project owns its statuses, task workflow, participants, and optional modules;
- approval is an independent business workflow rather than a hard-coded task status;
- every tenant-scoped request is checked against the active membership and filtered by `organizationId`.

## Product capabilities

- JWT access/refresh authentication, OTP registration, password reset, and multi-workspace switching.
- Organization onboarding and opaque-token invitations.
- Team lifecycle, membership, Project participation, and Project Manager invariants.
- Project list/detail/setup, configurable task statuses, board drag-and-drop, task search/report/export, assignees, checklists, comments, and approval requests.
- Four fixed optional Project modules: Milestones, Wiki Documents, Risks, and Files.
- Activity timeline, append-only audit records, and a tenant/recipient-scoped notification inbox.
- Authorized Project files and Task attachments backed by private local MinIO in Docker.
- Health/readiness endpoints and safe JSON operational events with HTTP request IDs.
- PostgreSQL migrations, deterministic demo data, tenant-negative security tests, and clean-database critical E2E regression.

## Architecture

```mermaid
flowchart LR
    Browser[React 18 SPA<br/>Redux Toolkit + RTK Query] -->|REST / JWT / x-organization-id| API[NestJS 11 modular monolith]
    API -->|TypeORM migrations and transactions| PG[(PostgreSQL 18)]
    API -->|OTP, refresh/session support| Redis[(Redis 7)]
    API -->|Authorized object operations| MinIO[(Private local MinIO)]
    API -->|SMTP| Email[Email provider]
    Jobs[BullMQ email job boundary<br/>integration tested] --> Redis
    Jobs --> PG
    Jobs --> Email

    subgraph Local production-like Docker network
        API
        PG
        Redis
        MinIO
    end
```

The served API is a NestJS modular monolith. PostgreSQL is the canonical persistence layer, and versioned migrations own schema changes. Redis is used selectively instead of as a second source of truth. MinIO is private: browsers receive files only through authorized TaskForge download endpoints and never receive object keys or public bucket URLs.

The BullMQ email producer/processor boundary is integration-tested for stable-ID jobs, retries, stale-recipient checks, and operational events. Wiring that worker into the final hosted runtime is intentionally reported as remaining release work rather than represented as already deployed.

## Simplified data model

```mermaid
erDiagram
    USER ||--o{ ORGANIZATION_MEMBERSHIP : has
    ORGANIZATION ||--o{ ORGANIZATION_MEMBERSHIP : contains
    ORGANIZATION ||--o{ ORGANIZATION_INVITATION : issues
    ORGANIZATION ||--o{ TEAM : owns
    ORGANIZATION_MEMBERSHIP ||--o{ TEAM_MEMBER : joins
    TEAM ||--o{ TEAM_MEMBER : contains

    ORGANIZATION ||--o{ PROJECT : owns
    PROJECT ||--o{ PROJECT_TEAM : includes
    TEAM ||--o{ PROJECT_TEAM : participates
    PROJECT ||--o{ PROJECT_MEMBERSHIP : grants
    ORGANIZATION_MEMBERSHIP ||--o{ PROJECT_MEMBERSHIP : qualifies
    PROJECT ||--o{ PROJECT_TASK_STATUS : configures
    PROJECT ||--o{ PROJECT_MODULE_SETTING : enables

    PROJECT ||--o{ TASK : contains
    TEAM ||--o{ TASK : owns
    PROJECT_TASK_STATUS ||--o{ TASK : classifies
    TASK ||--o{ TASK_ASSIGNEE : assigns
    PROJECT_MEMBERSHIP ||--o{ TASK_ASSIGNEE : receives
    TASK ||--o{ TASK_CHECKLIST_ITEM : contains
    TASK ||--o{ APPROVAL_REQUEST : requests
    TASK ||--o{ COMMENT : discusses

    PROJECT ||--o{ MILESTONE : plans
    PROJECT ||--o{ DOCUMENT : documents
    PROJECT ||--o{ RISK : tracks
    PROJECT ||--o{ PROJECT_FILE : links
    TASK ||--o{ TASK_ATTACHMENT : links
    STORED_FILE ||--o{ PROJECT_FILE : backs
    STORED_FILE ||--o{ TASK_ATTACHMENT : backs
```

The diagram is intentionally compact. The versioned migrations under `backend/src/database/migrations/` are the executable schema source.

## Technology

| Area | Stack |
|---|---|
| Frontend | React 18, Vite 7, Redux Toolkit, RTK Query, Tailwind CSS 4 |
| Backend | Node.js 24, TypeScript, NestJS 11, REST, Swagger/OpenAPI |
| Persistence | PostgreSQL 18, TypeORM 0.3, UUID identifiers |
| Async/cache | Redis 7, BullMQ |
| Files | MinIO S3-compatible private object storage; local Docker only |
| Delivery | Docker multi-stage images, Docker Compose, GitHub Actions, Render blueprint |
| Verification | Jest, Supertest, integration/E2E contract suites, frontend Node contract tests |

## Demo and screenshots

| Artifact | Current status |
|---|---|
| Public demo URL | Not deployed. Provisioning remains a separate, explicitly authorized action. |
| Local interactive review | Available through the frontend development helper: start Vite, open `/login`, then choose **Enable Mock Session & View Projects**. This is UI review data, not backend evidence. |
| Screenshots | Capture and commit the final Project Board, Task Detail/Approval, Wiki, and Risk views from the released UI. |
| API documentation | `http://localhost:8001/api/docs` when the backend is running. |

The deterministic PostgreSQL seed creates these local demo accounts with password `Password123!`:

| Account | Workspace role | Project role |
|---|---|---|
| `owner@taskforge.dev` | Owner | Project Manager |
| `pm@taskforge.dev` | Admin | Project Manager |
| `dev@taskforge.dev` | Member | Contributor |
| `designer@taskforge.dev` | Member | Contributor |

These credentials are for local portfolio data only. Do not reuse them for a public environment.

## Run the full local stack with Docker

Prerequisites: Docker Desktop with Docker Compose. The images use Node.js 24 internally.

1. Create a root `.env` file that is not committed and provide at least the required MinIO credentials. Replace every example secret before use:

   ```dotenv
   MINIO_ACCESS_KEY=taskforge-local
   MINIO_SECRET_KEY=replace-with-a-long-random-local-secret
   MINIO_BUCKET=taskforge-files
   JWT_ACCESS_SECRET=replace-with-at-least-32-characters
   JWT_REFRESH_SECRET=replace-with-at-least-32-characters
   JWT_VERIFIED_SECRET=replace-with-at-least-32-characters
   ```

2. Build and start the private PostgreSQL, Redis, MinIO, migration, API, and web services:

   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```

3. Check the application:

   - Web: `http://localhost`
   - API liveness: `http://localhost:8001/api/health`
   - API dependency readiness: `http://localhost:8001/api/health/ready`
   - Swagger UI: `http://localhost:8001/api/docs`

The migration container runs once before the API starts. PostgreSQL, Redis, and MinIO are attached only to the private Compose network; their ports are not published to the host.

### Optional local demo seed

The seed deletes and recreates only its deterministic demo organization, so run it only against a disposable local target you have checked. It never runs automatically and requires both production-mode confirmations inside the Compose stack:

```bash
docker compose -f docker-compose.prod.yml exec -e ALLOW_PRODUCTION_DEMO_SEED=true api node dist/database/seed/portfolio-seed.js --confirm-seed
```

Stop the containers without deleting their named volumes:

```bash
docker compose -f docker-compose.prod.yml down
```

## Run in development mode

### Backend

```powershell
cd backend
npm ci
Copy-Item .env.example .env
docker compose -f docker-compose.infrastructure.yml up -d --wait
npm run migration:run
npm run start:dev
```

On macOS/Linux, use `cp .env.example .env` instead of `Copy-Item`.

Configure `backend/.env` with the local PostgreSQL URL `postgresql://taskforge:taskforge@localhost:54329/taskforge`, `POSTGRES_SSL=false`, Redis at `localhost:6379`, and strong JWT secrets. Leave every `MINIO_*` value empty to use the local `backend/uploads/` adapter during hot reload; supply all six MinIO variables together when testing MinIO.

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The client uses `VITE_API_URL` when configured and otherwise defaults to `http://localhost:8001` for local development.

## Verification

The disposable test stack uses PostgreSQL on `54330`, Redis on `6380`, and MinIO on `9002`.

```bash
cd backend
npm ci
npm run test:db:up
npm run test:db:migrate
npm run typecheck
npm run test -- --runInBand
npm run test:security:postgres
npm run test:critical:postgres
npm run build
```

Frontend verification:

```bash
cd frontend
npm ci
npm test
npm run build
```

`test:critical:postgres` currently covers 12 PostgreSQL capability suites and 43 tests across onboarding, multi-organization access, Teams, Projects, Tasks/Approval, collaboration/files, optional modules, MinIO, and email-job behavior. CI repeats migrations from an empty database and gates backend/frontend builds in `.github/workflows/verify.yml`.

The test database teardown command removes the disposable test volumes. Run it only when that target is intentional:

```bash
cd backend
npm run test:db:down
```

## Deployment

- `docker-compose.prod.yml` is the verified local production-like topology, including private local MinIO and one-shot migrations.
- `render.yaml` describes the planned Render API, static frontend, and controlled migration job.
- No Render resources or public URL have been provisioned from this repository.
- Hosted file upload/download is unavailable by design because the selected MinIO deployment is local-only.
- Phase 7 source gates are complete. Before provisioning, provide the hosted API URL through `VITE_API_URL`, configure secrets, and accept the documented hosted-file limitation.

## Security and operational choices

- Tenant authority comes from the authenticated active Organization Membership, never from the client header alone.
- Project mutations use Project Membership capabilities rather than global or Organization-role inference.
- IDs are opaque UUIDs, and tenant-scoped queries include an explicit verified `organizationId`.
- File metadata is relational; objects remain private and downloads pass through authorization.
- Audit logs are append-only at the database layer.
- Structured logs use safe technical context and omit credentials, tokens, email addresses, request bodies, object keys, and error messages.
- `/api/health` is liveness; `/api/health/ready` and `/api/health/readiness` verify PostgreSQL and Redis dependencies.

## Trade-offs and deferred work

- OpenFGA and PostgreSQL RLS are deferred; application authorization and tenant-scoped queries are the v0.3 correctness boundary.
- No full Outbox, CQRS, event sourcing, realtime transport, or microservice split.
- BullMQ email jobs are integration-tested, but the final production worker composition and advanced DLQ/alerting remain release/backlog work.
- Local MinIO avoids provider cost and keeps files private, but a hosted demo cannot demonstrate file operations without a later approved storage provider.
- Metrics, distributed tracing, centralized logs, backup/restore rehearsal, malware scanning, load testing, autoscaling, and measured pool/query tuning require a real production requirement.
- PostgreSQL/TypeORM is the only served persistence path; historical migration documents may still describe the retired architecture.

## Repository map

```text
backend/                    NestJS API, migrations, domain modules, tests
frontend/                   React SPA and frontend contract tests
.github/workflows/verify.yml
                            clean-checkout CI verification
.spec-kit/specs/            canonical implementation plans
.spec-kit/adr/              architecture decisions
.ai/execution/phase-7/      concise current execution handoff
docker-compose.prod.yml     local production-like topology
render.yaml                 planned hosted deployment blueprint
```

Further detail:

- [Backend guide](backend/README.md) — backend setup and PostgreSQL migration commands.
- [Migration policy](backend/src/database/migrations/README.md) — versioned-schema workflow.
- [Project context](.ai/PROJECT_CONTEXT.md) — stable architecture decisions and canonical documentation map.
- [Release plan](.spec-kit/specs/07-product-release.plan.md) — current release checklist.

## Repository

[github.com/MinhPham204/TaskManager](https://github.com/MinhPham204/TaskManager)
