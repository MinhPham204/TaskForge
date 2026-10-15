# React + Vite

## Landing page

Anonymous visitors at `/` see the responsive TaskForge landing page adapted from `stitch-reference/landing_page`. Existing signed-in sessions continue to `/dashboard`. All Get Started / Start using TaskForge CTAs use `/login`; secondary actions explore product sections instead of duplicating the login action. Protected application routes still require authentication. The page shares the app's persisted light/dark preference and bundles the reference workspace illustration locally.

Run `npm.cmd run test:landing` for browser checks of responsive layout, FAQ, theme persistence, CTA navigation, and root/private-route behavior. Requires Playwright Chromium or installed Chrome on Windows; no backend is required (the authenticated redirect uses a stubbed session). Screenshots are written to `output/landing` in the repository root.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Task workflow/auth verification (Phase 12)

The shipped Task editor, Board/List/My Tasks, attachments and reset/session flows use canonical server read fields and capabilities. PM-only management/assignment/approval configuration is retained; read-all access does not grant mutation rights. Completed Task assignment/files remain allowed in mutable Projects; closed Project writes are denied.

Run `npm.cmd test` (26 scripts) and `npm.cmd run build` from frontend. Real-API Playwright acceptance is launched from backend with `npm.cmd run test:browser:postgres` or `npm.cmd run test:critical:p12`; install dependencies in both folders and use the guarded isolated test services. Dev Mock is disabled in acceptance; an ephemeral installed Chrome context is the local fallback, and CI installs Chromium.

[Phase 12 final verification/exit](../.spec-kit/specs/evidence/p12-12-workflow-auth-stabilization-verification.md) records exact scoped results and known full-lint baseline (3 existing errors/5 warnings outside changed files). Local source verified; external SMTP/hosted storage/smoke acceptance remains pending. Signup OTP stays excluded/unverified.

## Task interaction performance

Board hover updates only when the target column changes; memoized columns/cards avoid repainting unchanged cards. After a move, the Board reuses the cache listener's post-write read instead of forcing a second GET. Reads started before the write settles are still drained/replaced, and failed fresh reads still block further moves until refresh. Position, progress, and capabilities remain server-owned.

Successful Task creation uses the acknowledged POST response without waiting for a redundant detail GET. Follow-up assignment/approval commands still run on the server; partial failures and uncertain writes retain detail reconciliation and duplicate-creation protection.

Run `npm.cmd run test:board-performance` for request-count/race/editor regressions, or `npm.cmd run test:task-performance:browser` for actual Board/Form browser checks with 120 cards and controlled slow responses. The browser test requires Chromium or installed Chrome on Windows, uses test-only mocked HTTP responses, and does not measure live Supabase latency. Screenshots go to `output/task-performance` in the repository root.
