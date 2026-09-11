# Task Manager Backend (NestJS)

Backend API for a multi-tenant Task Manager SaaS application.

## Overview

This service provides:

- JWT authentication with access/refresh token flow
- 3-step onboarding flow: register -> verify OTP -> set password
- PostgreSQL-backed global users, workspace onboarding and invitations
- Membership-derived multi-tenant access for served onboarding routes
- Swagger API documentation

## Main Modules

Served modules in the PostgreSQL runtime:

- PostgreSQL onboarding/authentication
- organization invitations, Teams, Projects, configurable statuses and Tasks
- approvals, notifications, activity, files and four optional Project modules
- Shared Redis and email services

## Multi-Tenant Design

Tenant isolation for served workspace routes is implemented with two layers:

- JWT guard resolves an enabled global user.
- Membership guard verifies the requested workspace before the tenant interceptor
  establishes request context.

## Prerequisites

- Node.js 24 (the version used by CI and the production image)
- npm
- Docker Desktop, for local PostgreSQL, Redis, and the private MinIO integration-test service

The served API is PostgreSQL-only. It never runs TypeORM migrations at startup:
apply the reviewed migration explicitly before starting the API. Retired
persistence modules and their direct dependencies have been removed.

## Environment Setup

From `backend/`, install the lockfile-pinned dependencies and create a local
environment file:

```bash
npm ci
cp .env.example .env
```

On Windows PowerShell, use this copy command instead:

```powershell
Copy-Item .env.example .env
```

`.env.example` is configured for the API running inside the Docker Compose
network (`postgres` and `redis` hostnames). Fill the JWT and email values
in your uncommitted `.env`; never put real values in the template or Git.

For a host-run API, update the local-only `.env` values to use the ports exposed
by Compose:

```dotenv
POSTGRES_URL=postgresql://taskforge:taskforge@localhost:54329/taskforge
POSTGRES_SSL=false
POSTGRES_SYNCHRONIZE=false
REDIS_HOST=localhost
REDIS_PORT=6379
```

The required application secrets are:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_VERIFIED_SECRET`
- `EMAIL_USER`
- `EMAIL_PASS`

## Run Locally

Start PostgreSQL and Redis when running Nest directly on the host:

```bash
docker compose up -d postgres redis
npm run migration:run
npm run start:dev
```

Alternatively, run the API and its PostgreSQL/Redis dependencies together in Docker:

```bash
docker compose up --build
```

URLs:

- API: http://localhost:8001/api
- Swagger: http://localhost:8001/api/docs
- Health check: http://localhost:8001/api/health

## PostgreSQL Migration Infrastructure

Start the isolated PostgreSQL 18 and Redis services used by the TypeORM
migration workflow:

```bash
docker compose -f docker-compose.infrastructure.yml up -d
```

The local defaults expose PostgreSQL on `localhost:54329` and Redis on
`localhost:6379`. Before using any migration command, confirm that this is the
intended disposable local target, then set these local-only values in `.env`:

```dotenv
POSTGRES_URL=postgresql://taskforge:taskforge@localhost:54329/taskforge
POSTGRES_SSL=false
POSTGRES_SYNCHRONIZE=false
```

The Compose credentials are development-only and must never be reused for
Supabase or Render. `POSTGRES_SYNCHRONIZE=true` is rejected; schema changes are
always versioned migrations.

Inspect migration status first:

```bash
npm run migration:show
```

Apply pending migrations only after confirming the target:

```bash
npm run migration:run
```

To build before running the compiled migration CLI, use:

```bash
npm run build
npm run migration:run:compiled
```

`migration:revert` rolls back the latest migration and is state-changing; use
it only on a confirmed disposable target. The first migration currently enables
technical PostgreSQL extensions only. Business tables are added by their owning
capability phase.

Check readiness without changing database state:

```bash
docker compose -f docker-compose.infrastructure.yml ps
```

Reset only this disposable PostgreSQL environment after confirming it is not
needed. The command removes only this Compose project's `postgres_data` volume:

```bash
docker compose -f docker-compose.infrastructure.yml down --volumes
```

## PostgreSQL Integration Test Runtime

P2 uses a separate local-only Compose project for database integration tests.
It is intentionally not the normal development PostgreSQL volume and cannot
target Supabase, Render, or another remote database.

```bash
npm run test:db:up
npm run test:db:migrate
npm run test:integration
```

The fixed test target is `localhost:54330/taskforge_test`. The test scripts
fail closed if `POSTGRES_TEST_URL` points anywhere else. Remove only that test
project and its volume after inspection with:

```bash
npm run test:db:down
```

To run the complete local verification lifecycle (database up, migration,
unit tests, PostgreSQL integration tests and build), use:

```bash
npm run verify:local
```

`PostgresOnboardingTestModule` remains test-only. The served `AppModule` now
uses `PostgresOnboardingRuntimeModule`; the runtime smoke test verifies its
health endpoint and Swagger contract without reading a local `.env`.

## Local MinIO object storage

MinIO is supported only as a private, local Docker service for the portfolio
production-like demo. The browser never receives a MinIO object URL or key:
file download remains authorized by the TaskForge API and `StoredFile` record.
No MinIO service, disk, bucket, or credentials are provisioned on Render.

Set all six `MINIO_*` variables listed in `.env.example` in an uncommitted local
environment. A partial MinIO configuration is rejected at startup. The adapter
creates the configured bucket lazily on its first upload; application and unit
test startup do not create a bucket.

The disposable test Compose project includes private MinIO on
`localhost:9002` only. Start it with the normal test runtime, then run the
actual MinIO contract suite:

```bash
npm run test:db:up
npm run test:db:migrate
npm run test:storage:minio
```

For the full local production-like stack, run `docker compose -f
docker-compose.prod.yml up --build` from the repository root after supplying
local-only secrets. Its MinIO API and Console are internal to the Compose
network and data persists in `minio_prod_data`. This is not a cloud production
deployment and must not be described as a public durable object-storage service.

## Scripts

- `npm ci`
- `npm run build`
- `npm run start`
- `npm run start:dev`
- `npm run start:debug`
- `npm run start:prod`
- `npm run lint`
- `npm run lint:check`
- `npm run typecheck`
- `npm run format`
- `npm run test`
- `npm run test:watch`
- `npm run test:cov`
- `npm run test:e2e`
- `npm run test:db:up`
- `npm run test:db:migrate`
- `npm run test:integration`
- `npm run test:e2e:postgres`
- `npm run test:runtime:postgres`
- `npm run test:storage:minio`
- `npm run test:db:down`
- `npm run verify:local`
- `npm run migration:show`
- `npm run migration:run`
- `npm run migration:revert`
- `npm run migration:run:compiled`

## Notes

- Global API prefix is `api`.
- CORS origin is read from `CLIENT_URL`.
- Redis is required for OTP/session support and the tested BullMQ email boundary.
- BullMQ email jobs are integration-tested but are not registered in the served
  runtime; do not present asynchronous invitation/assignment/approval/reminder
  email as a deployed capability until worker composition is implemented.
- Render deployment configuration is in `../render.yaml`. It keeps auto-deploy
  disabled and requires user-provided PostgreSQL, Redis, email, CORS, and frontend
  API URL configuration; do not provision external services from this guide.
- Phase 7 implementation is complete; controlled deployment is the next external action.
