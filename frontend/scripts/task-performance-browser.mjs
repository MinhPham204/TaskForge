import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import { API_PATHS } from '../src/utils/apiPaths.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '../output/task-performance');
const projectId = 'performance-project';
const capabilities = Object.fromEntries(['transition', 'assign', 'unassign', 'configureApproval', 'editContent', 'editManagement'].map(name => [name, { allowed: true }]));
const statuses = [
  { id: 'todo', name: 'To Do', semanticCategory: 'TODO' },
  { id: 'doing', name: 'In Progress', semanticCategory: 'IN_PROGRESS' },
];
const tasks = Array.from({ length: 120 }, (_, index) => ({
  id: `task-${index}`, title: `Performance Task ${index}`, projectId, statusId: 'todo',
  owningTeamId: 'team', owningTeamName: 'Engineering', description: '', priorityCode: 'MEDIUM',
  semanticCategory: 'TODO', effectiveProgress: 45, assigneeProjectMembershipIds: [], capabilities,
}));
const project = { id: projectId, name: 'Performance Project', state: 'ACTIVE', viewer: { canManage: true, canCreateTask: true } };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const entry = `
  import React, { useState, Profiler } from 'react';
  import { createRoot } from 'react-dom/client';
  import { Provider } from 'react-redux';
  import { MemoryRouter } from 'react-router-dom';
  import { store } from '/src/store/index.js';
  import { setSessionFromDev, setActiveOrganization } from '/src/store/authSlice.js';
  import { ThemeProvider } from '/src/components/ThemeProvider.jsx';
  import Board from '/src/pages/Projects/components/ProjectTaskBoardTab.jsx';
  import TaskForm from '/src/pages/Projects/components/TaskFormModal.jsx';
  import '/src/index.css';
  const h = React.createElement;
  store.dispatch(setSessionFromDev({ user: { id: 'performance-user', name: 'PM' }, token: 'test', organizations: [{ organizationId: 'performance-org' }] }));
  store.dispatch(setActiveOrganization('performance-org'));
  window.boardCommits = 0;
  function Harness() {
    const [open, setOpen] = useState(false);
    return h('div', { style: { padding: 24 } },
      h(Profiler, { id: 'board', onRender: () => { window.boardCommits++; } },
        h(Board, { projectId: '${projectId}', canCreateTask: true, onCreateTask: () => setOpen(true) })),
      open && h(TaskForm, { projectId: '${projectId}', isOpen: true, onClose: () => setOpen(false) }));
  }
  createRoot(document.getElementById('root')).render(h(Provider, { store }, h(MemoryRouter, null, h(ThemeProvider, null, h(Harness)))));
`;
const vite = await createServer({ root, configFile: resolve(root, 'vite.config.js'), envFile: false,
  define: { 'import.meta.env.DEV': 'false' }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
  plugins: [{ name: 'task-performance-harness',
    resolveId(id) { if (id === 'virtual:task-performance') return '\0virtual:task-performance'; },
    load(id) { if (id === '\0virtual:task-performance') return entry; },
    configureServer(server) {
      server.middlewares.use('/__task-performance', async (_req, res, next) => {
        try {
          const html = await server.transformIndexHtml('/__task-performance', '<!doctype html><html><head><title>Task performance verification</title></head><body><div id="root"></div><script type="module" src="/@id/virtual:task-performance"></script></body></html>');
          res.setHeader('Content-Type', 'text/html'); res.end(html);
        } catch (error) { next(error); }
      });
    },
  }],
});
let browser, page, boardGate;
let boardReads = 0, statusWrites = 0, creates = 0, detailReads = 0;
const errors = [];
try {
  await mkdir(output, { recursive: true });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const launch = { headless: true };
  try { await access(chromium.executablePath()); } catch { if (process.platform === 'win32') launch.channel = 'chrome'; }
  browser = await chromium.launch(launch);
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      const method = route.request().method();
      if (path === API_PATHS.PROJECTS.TASKS.BOARD(projectId)) {
        boardReads++;
        const snapshot = statuses.map(status => ({ ...status, tasks: tasks.filter(task => task.statusId === status.id) }));
        await boardGate?.promise;
        return route.fulfill({ json: snapshot });
      }
      if (method === 'PATCH' && path.endsWith('/status')) {
        statusWrites++;
        Object.assign(tasks[0], { statusId: 'doing', semanticCategory: 'IN_PROGRESS' });
        return route.fulfill({ json: tasks[0] });
      }
      if (method === 'POST' && path === API_PATHS.PROJECTS.TASKS.CREATE(projectId)) {
        creates++;
        const created = { ...tasks[1], ...route.request().postDataJSON(), id: 'created-task', assigneeProjectMembershipIds: [], requiresApproval: false };
        tasks.push(created);
        return route.fulfill({ json: created });
      }
      if (/\/tasks\/[^/]+$/.test(path) && !path.endsWith('assignment-candidates')) {
        detailReads++; return route.fulfill({ json: tasks.at(-1) });
      }
      const data = new Map([
        [API_PATHS.PROJECTS.LIST, [project]],
        [API_PATHS.PROJECTS.GET_BY_ID(projectId), project],
        [API_PATHS.PROJECTS.PARTICIPANTS.TEAMS(projectId), [{ id: 'team', teamId: 'team', name: 'Engineering' }]],
        [API_PATHS.PROJECTS.PARTICIPANTS.MEMBERS(projectId), [{ id: 'pm', projectMembershipId: 'pm', role: 'PROJECT_MANAGER', user: { id: 'performance-user', name: 'PM' } }]],
        [API_PATHS.PROJECTS.STATUSES.LIST(projectId), statuses],
        [API_PATHS.PROJECTS.MILESTONES.LIST(projectId), []],
        [API_PATHS.PROJECTS.TASKS.ASSIGNMENT_CANDIDATES(projectId), []],
        [API_PATHS.ORGANIZATIONS.MY_PERMISSIONS('performance-org'), { isOwner: true, role: { id: 'owner', name: 'Owner' }, permissions: [] }],
      ]);
      if (data.has(path)) return route.fulfill({ json: data.get(path) });
      throw new Error(`Unexpected test request: ${method} ${path}`);
    }
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    return route.abort();
  });
  await page.goto(origin + '/__task-performance');
  await expect(page.locator('article')).toHaveCount(120);
  const moved = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Performance Task 0', exact: true }) });
  await expect(moved).toHaveAttribute('draggable', 'true');
  const commits = await page.evaluate(() => window.boardCommits);
  await moved.evaluate(source => {
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const target = document.querySelectorAll('[data-purpose="kanban-column"]')[1];
    for (let i = 0; i < 100; i++) target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.locator('[data-purpose="kanban-column"]').nth(1)).toHaveClass(/ring-2/);
  assert.ok(await page.evaluate(() => window.boardCommits) - commits <= 2, 'Repeated hover events must not repeatedly commit the entire Board');
  boardGate = deferred();
  await page.locator('[data-purpose="kanban-column"]').nth(1).evaluate(target => {
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
  });
  await expect.poll(() => statusWrites).toBe(1);
  await expect.poll(() => boardReads).toBe(2);
  await expect(page.getByRole('status')).toContainText('Saving move');
  await expect(moved).toHaveAttribute('draggable', 'false');
  boardGate.resolve(); boardGate = undefined;
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('[data-purpose="kanban-column"]').nth(1).locator('article')).toHaveCount(1);
  assert.equal(boardReads, 2, 'Only one refresh after dropping a Task');
  await page.screenshot({ path: resolve(output, 'board.png') });

  await page.getByRole('button', { name: 'Create Task', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#task-title').fill('Fast acknowledged creation');
  const submit = dialog.getByRole('button', { name: 'Create Task', exact: true });
  await expect(submit).toBeEnabled();
  boardGate = deferred();
  await submit.click();
  await expect.poll(() => creates).toBe(1);
  await expect(dialog).toHaveCount(0); // Board refresh is still deliberately held.
  assert.equal(detailReads, 0, 'No redundant detail GET before closing creation');
  await expect.poll(() => boardReads).toBe(3);
  boardGate.resolve(); boardGate = undefined;
  await expect(page.locator('article')).toHaveCount(121);
  assert.equal(boardReads, 3);
  assert.deepEqual(errors, []);
  console.log('Task performance browser PASS: 120-card hover, one Board GET per drop, pending locks, saved position, create closes before delayed Board refresh, zero create-detail GETs. Controlled API responses; no live Supabase timing claim.');
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  boardGate?.resolve();
  await browser?.close();
  await vite.close();
}
