# TaskForge Project Constitution

## Core Architecture Principles
1. **Multi-Tenancy Isolation**: Every database query and mutation MUST filter by `organizationId`. Context is managed strictly via `AsyncLocalStorage` inside `tenant-storage.service.ts`.
2. **Atomic Mutations**: Any state transitions for tasks (especially approval workflows) MUST use atomic operations (`findOneAndUpdate`) to prevent Race Conditions.
3. **Role-Based Access Control (RBAC)**: Enforce `RolesGuard`, `OrgAdminGuard`, and `OrgOwnerGuard` on all sensible endpoints.
4. **No Direct State Manipulation**: Frontend MUST mutate states via RTK Query tags invalidation, never hardcode optimistic state bypasses.

## Tech Stack Standards
- Backend: NestJS, Mongoose, Redis, BullMQ
- Frontend: React (Vite), Tailwind CSS, Redux Toolkit (RTK Query)