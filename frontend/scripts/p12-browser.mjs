import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const fixture = JSON.parse(Buffer.concat(input).toString());
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(frontendRoot, '../.spec-kit/specs/evidence/p12-11-browser');
await mkdir(evidenceRoot, { recursive: true });
const results = [];
const bootstrapOnly = process.env.P12_BROWSER_SCOPE === 'bootstrap';
let currentCase = 'launch', browser, page;
let apiRequests = 0, signupRequests = 0, preResetRefresh;
const scenario = fixture.scenarios.DRAFT;
const projectPath = `/projects/${scenario.projectId}`;
const taskPath = id => `/api/projects/${scenario.projectId}/tasks/${id}`;
const vite = await createServer({ root: frontendRoot, configFile: resolve(frontendRoot, 'vite.config.js'), envFile: false,
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify(fixture.baseURL), 'import.meta.env.DEV': 'false' },
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });

const record = async (name, operation) => {
  if (bootstrapOnly && !['empty account', 'real Team/Project', 'Project completion/archive'].some(prefix => name.startsWith(prefix))) return;
  currentCase = name;
  await operation();
  results.push({ case: name, status: 'verified', surface: 'Chromium browser + real Nest/PostgreSQL HTTP' });
  console.log(`P12 browser PASS: ${name}`);
};
try {
  await vite.listen();
  const address = vite.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  let launch = { headless: true };
  try { await access(chromium.executablePath()); } catch { if (process.platform === 'win32') launch.channel = 'chrome'; }
  browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  // Keep acceptance hermetic: source/assets and API are served from loopback only.
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/') || url.startsWith(fixture.baseURL + '/') || !/^https?:/.test(url)) return route.continue();
    return route.abort('blockedbyclient');
  });
  page.on('request', request => { if (request.url().startsWith(fixture.baseURL + '/api/')) apiRequests++; if (/\/auth\/(register|verify-otp|set-password)$/.test(request.url())) signupRequests++; });
  const api = async (path, options = {}, status) => {
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const response = await context.request.fetch(fixture.baseURL + path, {
      method: options.method || 'GET', data: options.data,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-organization-id': options.organizationId || fixture.organizationId },
    });
    if (status !== undefined) assert.equal(response.status(), status, `HTTP status for ${path}`);
    else assert.ok(response.ok(), `HTTP request rejected: ${response.status()} ${path}`);
    return response.status() === 204 ? null : response.json();
  };
  const read = (id = scenario.manual) => api(taskPath(id));
  const poll = async (id, predicate) => expect.poll(async () => predicate(await read(id)), { timeout: 15000 }).toBe(true);
  const login = async (actor, password = fixture.password) => {
    await page.goto(origin + '/login');
    await page.getByLabel('Email Address', { exact: true }).fill(actor.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Email Address', { exact: true }).focus(); await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();
    await page.evaluate(id => localStorage.setItem('activeOrganizationId', id), fixture.organizationId);
  };
  const board = async () => { await page.goto(origin + projectPath + '?tab=board'); await expect(page.locator('article').first()).toBeVisible(); };
  const card = title => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const detail = async id => { await page.goto(origin + projectPath + `?tab=board&task=${id}`); await expect(page.getByRole('dialog').first()).toBeVisible(); await expect(page.getByRole('button', { name: /^Edit/ }).first()).toBeVisible(); return page.getByRole('dialog').first(); };
  const edit = async id => { const dialog = await detail(id); await dialog.getByRole('button', { name: /^Edit/ }).click(); await expect(page.locator('#task-title')).toBeEnabled(); return page.getByRole('dialog').last(); };
  const save = async () => { await page.getByRole('button', { name: 'Save Changes', exact: true }).click(); await expect(page.locator('#task-title')).toHaveCount(0); };
  const shot = async name => page.screenshot({ path: resolve(evidenceRoot, name + '.png'), fullPage: true, mask: [page.locator('input[type=password], #reset-code, input[autocomplete=one-time-code]')] });

  await record('login wrong/right and Board canonical metadata after reload', async () => {
    await page.goto(origin + '/login');
    await page.getByPlaceholder('john@example.com').fill(fixture.actors.pm.email);
    await page.locator('form input[type=password]').fill('wrong-test-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('john@example.com')).toHaveValue(fixture.actors.pm.email);
    await login(fixture.actors.pm); await board();
    await expect(card('P12 manual')).toContainText('45%');
    await expect(card('P12 checklist')).toContainText('33%');
    await expect(card('P12 completed')).toContainText('100%');
    await page.reload(); await expect(card('P12 manual')).toContainText('45%');
    assert.ok(apiRequests > 10); await expect(page.getByText('Dev Review Mode')).toHaveCount(0);
    await shot('board-light');
  });

  let title = 'P12 browser edited';
  await record('Board editor dirty fields, empty clears and multiple assignment', async () => {
    const before = await read(); await edit(scenario.manual);
    await page.locator('#task-title').fill(title); await save();
    const after = await read();
    for (const field of ['description', 'dueAt', 'milestoneId', 'statusId']) assert.equal(after[field], before[field]);
    await edit(scenario.manual);
    await page.getByPlaceholder('Add detailed description, acceptance criteria, requirements, or type \'/\' for commands...').fill('');
    await page.locator('#task-due').fill(''); await page.locator('#task-milestone').selectOption('');
    await page.getByLabel('Eligible assignees').selectOption([fixture.actors.assignee.projectMembershipId, fixture.actors.contributor.projectMembershipId]);
    await save();
    await poll(scenario.manual, task => task.description === '' && task.dueAt === null && task.milestoneId === null && task.assigneeProjectMembershipIds.length === 2);
    await edit(scenario.manual); await page.getByRole('button', { name: 'Remove assignee', exact: true }).click(); await save();
    await poll(scenario.manual, task => task.assigneeProjectMembershipIds.length === 1 && task.assigneeProjectMembershipIds[0] === fixture.actors.contributor.projectMembershipId);
    await board(); await expect(card(title)).toContainText('45%');
  });

  await record('Light/Dark, narrow viewport, keyboard Escape and workspace switching', async () => {
    await page.goto(origin + '/settings/personal'); await page.getByRole('radio', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/); await board(); await shot('board-dark');
    await page.setViewportSize({ width: 390, height: 844 }); await board(); await expect(card(title)).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await shot('board-narrow');
    await detail(scenario.manual); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Active workspace' }).click(); await page.getByRole('button', { name: 'P12 browser second workspace', exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    assert.equal(await page.evaluate(() => localStorage.getItem('activeOrganizationId')), fixture.secondOrganizationId);
    await page.goto(origin + '/dashboard'); await page.reload(); await expect(page.getByRole('button', { name: 'Active workspace' })).toContainText('P12 browser second workspace');
    await page.getByRole('button', { name: 'Active workspace' }).click(); await page.getByRole('button', { name: 'P12 baseline', exact: true }).click();
    await page.goto(origin + '/settings/personal'); await page.getByRole('radio', { name: 'Light', exact: true }).click(); await expect(page.locator('html')).not.toHaveClass(/dark/);
    await board(); await expect(card(title)).toBeVisible();
  });

  await record('partial editor failure and retry only remaining status command', async () => {
    let reject = true, contentWrites = 0;
    const statusUrl = fixture.baseURL + taskPath(scenario.manual) + '/status';
    page.on('request', request => { if (request.url() === fixture.baseURL + taskPath(scenario.manual) && request.method() === 'PATCH') contentWrites++; });
    await page.route(statusUrl, async route => reject ? route.fulfill({ status: 503, json: { message: 'Test-only transition service failure' } }) : route.continue());
    await edit(scenario.manual); title = 'P12 partial persisted'; await page.locator('#task-title').fill(title);
    const target = scenario.statuses.find(status => status.semanticCategory === 'NOT_STARTED');
    await page.locator('#task-status').selectOption(target.id);
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry Remaining Changes' })).toBeVisible();
    assert.equal((await read()).title, title); const writes = contentWrites;
    reject = false; await page.getByRole('button', { name: 'Retry Remaining Changes' }).click();
    await expect(page.locator('#task-title')).toHaveCount(0);
    await poll(scenario.manual, task => task.statusId === target.id); assert.equal(contentWrites, writes);
    await page.unroute(statusUrl);
  });

  await record('manual progress and checklist persist across Board/List/detail reload', async () => {
    let dialog = await detail(scenario.manual);
    await dialog.locator('input[type=range]').fill('65'); await dialog.getByRole('button', { name: 'Update Progress' }).click();
    await poll(scenario.manual, task => task.effectiveProgress === 65);
    await board(); await expect(card(title)).toContainText('65%');
    await page.getByRole('button', { name: 'Tasks', exact: true }).click(); await expect(page.getByText(title, { exact: true })).toBeVisible();
    dialog = await detail(scenario.checklist); await dialog.getByRole('checkbox', { name: 'Item 2', exact: true }).click();
    await poll(scenario.checklist, task => task.effectiveProgress === 66);
    await expect(dialog.getByRole('checkbox', { name: 'Item 2', exact: true })).toBeChecked();
    await board(); await expect(card('P12 checklist')).toContainText('66%');
    await page.reload(); await expect(card('P12 checklist')).toContainText('66%');
  });

  await record('detail transition denial remains visible after authoritative refetch', async () => {
    const dialog = await detail(scenario.checklist); const complete = scenario.statuses.find(status => status.semanticCategory === 'COMPLETED');
    await dialog.locator('#transition-status').selectOption(complete.id);
    const denied = page.waitForResponse(response => response.url().endsWith(taskPath(scenario.checklist) + '/status') && response.status() === 409);
    await dialog.getByRole('button', { name: 'Move', exact: true }).click(); await denied;
    await expect(dialog.getByRole('alert')).toContainText(/checklist/i);
    const saved = await read(scenario.checklist); assert.notEqual(saved.statusId, complete.id);
    await expect(dialog.locator('#transition-status')).toHaveValue(saved.statusId); await expect(dialog.getByRole('alert')).toContainText(/checklist/i);
  });

  await record('native Board drag, domain denial and lost acknowledgment reconciliation', async () => {
    await page.setViewportSize({ width: 1920, height: 1000 }); await board();
    const column = semantic => page.locator('[data-purpose=kanban-column]').filter({ has: page.getByRole('heading', { name: scenario.statuses.find(s => s.semanticCategory === semantic).name, exact: true }) });
    const progress = scenario.statuses.find(s => s.semanticCategory === 'IN_PROGRESS');
    await card(title).dragTo(column('IN_PROGRESS')); await poll(scenario.manual, task => task.statusId === progress.id);
    await expect(column('IN_PROGRESS').locator('article').filter({ hasText: title })).toBeVisible();
    const complete = scenario.statuses.find(s => s.semanticCategory === 'COMPLETED');
    await expect(card('P12 checklist')).toHaveAttribute('draggable', 'true');
    const denial = page.waitForResponse(response => response.url().endsWith(taskPath(scenario.checklist) + '/status') && response.status() === 409);
    await card('P12 checklist').dragTo(column('COMPLETED')); await denial;
    await expect(page.getByText('Complete the remaining checklist items before completing this Task.', { exact: false })).toBeVisible();
    assert.notEqual((await read(scenario.checklist)).statusId, complete.id);
    const url = fixture.baseURL + taskPath(scenario.manual) + '/status';
    await page.route(url, route => route.fulfill({ status: 403, json: { code: 'TASK_EXECUTION_ACCESS_REQUIRED', message: 'Test-only stale authority denial' } }));
    await expect(card(title)).toHaveAttribute('draggable', 'true');
    await card(title).dragTo(column('COMPLETED')); await expect(card(title)).toHaveAttribute('draggable', 'true');
    assert.equal((await read()).statusId, progress.id); await page.unroute(url);
    let transitions = 0;
    await page.route(url, async route => { transitions++; await route.fetch(); await route.abort('failed'); });
    await expect(card(title)).toHaveAttribute('draggable', 'true');
    await card(title).dragTo(column('NOT_STARTED'));
    const start = scenario.statuses.find(s => s.semanticCategory === 'NOT_STARTED');
    await poll(scenario.manual, task => task.statusId === start.id);
    await expect(column('NOT_STARTED').locator('article').filter({ hasText: title })).toBeVisible();
    assert.equal(transitions, 1); await page.unroute(url); await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await record('pending move is serialized and late response cannot cross workspace scope', async () => {
    await board(); let release, arrived;
    const waiting = new Promise(resolve => { release = resolve; });
    const committed = new Promise(resolve => { arrived = resolve; });
    const url = fixture.baseURL + taskPath(scenario.manual) + '/status';
    await page.route(url, async route => { const response = await route.fetch(); arrived(); await waiting; await route.fulfill({ response }); });
    try {
      const progress = scenario.statuses.find(s => s.semanticCategory === 'IN_PROGRESS');
      const column = page.locator('[data-purpose=kanban-column]').filter({ has: page.getByRole('heading', { name: progress.name, exact: true }) });
      await card(title).dragTo(column); await committed;
      await expect(card(title)).toHaveAttribute('draggable', 'false'); await expect(card('P12 checklist')).toHaveAttribute('draggable', 'false');
      await page.getByRole('button', { name: 'Active workspace' }).click(); await page.getByRole('button', { name: 'P12 browser second workspace', exact: true }).click();
      release(); await expect(page.getByText(title, { exact: true })).toHaveCount(0);
      await poll(scenario.manual, task => task.statusId === progress.id);
      await expect(page.getByRole('button', { name: 'Active workspace' })).toContainText('P12 browser second workspace');
      await page.getByRole('button', { name: 'Active workspace' }).click(); await page.getByRole('button', { name: 'P12 baseline', exact: true }).click();
      await board(); await expect(card(title)).toBeVisible();
    } finally { release(); await page.unroute(url); }
  });

  await record('actual attachment multipart/download/unlink and validation/read failure', async () => {
    const dialog = await detail(scenario.manual);
    const files = dialog.locator('section').filter({ has: page.getByRole('heading', { name: /^Attachments/ }) });
    await expect(files.getByText('No files attached.')).toBeVisible();
    await files.getByLabel('Select file').setInputFiles({ name: 'p12-empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
    await expect(files.getByRole('alert')).toContainText(/empty|zero|at least/i);
    await files.getByLabel('Select file').setInputFiles({ name: 'p12-too-big.txt', mimeType: 'text/plain', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(files.getByRole('alert')).toContainText(/10 MiB|too large|maximum/i);
    await files.getByLabel('Select file').setInputFiles({ name: 'p12-unsupported.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not an executable') });
    await expect(files.getByRole('alert')).toContainText(/PDF|supported|type/i);
    const bytes = Buffer.from('P12 browser exact bytes');
    await files.getByLabel('Select file').setInputFiles({ name: 'p12-browser.txt', mimeType: 'text/plain', buffer: bytes });
    await files.getByRole('button', { name: 'Upload file', exact: true }).click();
    await expect(files.getByRole('button', { name: 'Download p12-browser.txt' })).toBeVisible();
    const downloaded = page.waitForEvent('download'); await files.getByRole('button', { name: 'Download p12-browser.txt' }).click();
    const download = await downloaded; assert.equal(download.suggestedFilename(), 'p12-browser.txt');
    assert.deepEqual(await readFile(await download.path()), bytes);
    await files.getByRole('button', { name: 'Remove p12-browser.txt' }).click();
    await files.getByRole('button', { name: 'Confirm remove' }).click(); await expect(files.getByText('No files attached.')).toBeVisible();
    const url = fixture.baseURL + taskPath(scenario.manual) + '/attachments';
    await page.route(url, route => route.request().method() === 'GET' ? route.fulfill({ status: 503, json: { message: 'Test-only file list failure' } }) : route.continue());
    await files.getByRole('button', { name: 'Refresh files' }).click();
    await expect(files.getByRole('button', { name: 'Retry file list' })).toBeVisible();
    await page.unroute(url); await files.getByRole('button', { name: 'Retry file list' }).click(); await expect(files.getByText('No files attached.')).toBeVisible();
  });

  await record('Completed Task assignment/files with FILES off and Project Files round-trip', async () => {
    await api('/api/projects/' + scenario.projectId + '/modules', { method: 'POST', data: { moduleCode: 'FILES', enabled: false } });
    let dialog = await detail(scenario.completed); await expect(dialog.getByLabel('Select file')).toBeEnabled();
    await dialog.getByLabel('Select file').setInputFiles({ name: 'p12-completed.txt', mimeType: 'text/plain', buffer: Buffer.from('Completed still mutable attachments') });
    await dialog.getByRole('button', { name: 'Upload file', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Download p12-completed.txt' })).toBeVisible();
    await edit(scenario.completed); await page.getByLabel('Eligible assignees').selectOption(fixture.actors.contributor.projectMembershipId); await save();
    await poll(scenario.completed, task => task.assigneeProjectMembershipIds.includes(fixture.actors.contributor.projectMembershipId) && task.effectiveProgress === 100);
    dialog = await detail(scenario.completed); await dialog.getByRole('button', { name: 'Remove p12-completed.txt' }).click(); await dialog.getByRole('button', { name: 'Confirm remove' }).click();
    await expect(dialog.getByText('No files attached.')).toBeVisible();
    await api('/api/projects/' + scenario.projectId + '/modules', { method: 'POST', data: { moduleCode: 'FILES', enabled: true } });
    await page.goto(origin + projectPath + '?tab=files');
    const files = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Project Files/ }) });
    await files.getByLabel('Select file').setInputFiles({ name: 'p12-project.txt', mimeType: 'text/plain', buffer: Buffer.from('Project bytes') });
    await files.getByLabel('Display name').fill('Project browser file'); await files.getByRole('button', { name: 'Upload file', exact: true }).click();
    await expect(files.getByRole('button', { name: 'Download p12-project.txt' })).toBeVisible();
    const pending = page.waitForEvent('download'); await files.getByRole('button', { name: 'Download p12-project.txt' }).click();
    assert.equal((await readFile(await (await pending).path())).toString(), 'Project bytes');
    await files.getByRole('button', { name: 'Remove p12-project.txt' }).click(); await files.getByRole('button', { name: 'Confirm remove' }).click(); await expect(files.getByText('No files attached.')).toBeVisible();
    await page.reload(); await expect(files.getByText('No files attached.')).toBeVisible();
  });

  await record('late detail mutation cannot clear a newer Task comment draft', async () => {
    let release, arrived; const waiting = new Promise(resolve => { release = resolve; }); const committed = new Promise(resolve => { arrived = resolve; });
    const url = fixture.baseURL + taskPath(scenario.manual) + '/comments';
    await page.route(url, async route => { if (route.request().method() !== 'POST') return route.continue(); const response = await route.fetch(); arrived(); await waiting; await route.fulfill({ response }); });
    try {
      const dialog = await detail(scenario.manual); await dialog.getByLabel('New comment').fill('P12 scope-owned comment'); await dialog.getByRole('button', { name: 'Post', exact: true }).click(); await committed;
      await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.getByRole('button', { name: 'Board', exact: true }).click(); await card('P12 checklist').click(); await page.getByLabel('New comment').fill('Keep the newer Task draft');
      release(); await expect(page.getByLabel('New comment')).toHaveValue('Keep the newer Task draft');
      await poll(scenario.manual, task => task.comments.some(comment => comment.body === 'P12 scope-owned comment'));
      await expect(page.getByLabel('New comment')).toHaveValue('Keep the newer Task draft');
      assert.equal((await read(scenario.checklist)).comments.some(comment => comment.body === 'Keep the newer Task draft'), false);
    } finally { release(); await page.unroute(url); }
  });

  await record('PM creation, comments, approval cancel/reject/approve and self-authority denial', async () => {
    await board(); await page.keyboard.press('c'); await expect(page.locator('#task-title')).toBeEnabled(); await page.keyboard.press('Escape'); await expect(page.locator('#task-title')).toHaveCount(0);
    await page.goto(origin + projectPath + '?tab=board&createTask=true');
    await expect(page.locator('#task-title')).toBeEnabled();
    await page.locator('#task-title').fill('P12 browser PM-created');
    await page.locator('#task-team').selectOption(fixture.teamId);
    await page.locator('#task-status').selectOption(scenario.statuses.find(s => s.semanticCategory === 'NOT_STARTED').id);
    await page.getByRole('dialog').last().getByRole('button', { name: 'Create Task', exact: true }).click();
    await expect(page.locator('#task-title')).toHaveCount(0);
    const created = (await api('/api/projects/' + scenario.projectId + '/tasks')).find(task => task.title === 'P12 browser PM-created');
    assert.ok(created);
    const members = await api('/api/projects/' + scenario.projectId + '/members');
    const pmMember = members.find(member => member.user?.id === fixture.actors.pm.id);
    await api(taskPath(created.id) + '/approval', { method: 'PATCH', data: { approverProjectMembershipId: pmMember.projectMembershipId || pmMember.id } }, 409);
    const dialog = await detail(scenario.approval);
    await dialog.getByPlaceholder('Write a comment...').fill('P12 browser comment persisted');
    await dialog.getByRole('button', { name: 'Post', exact: true }).click();
    await poll(scenario.approval, task => task.comments.some(comment => comment.body === 'P12 browser comment persisted'));
    const action = async label => { await page.getByRole('dialog').first().getByRole('button', { name: label, exact: true }).click(); await page.getByRole('dialog').last().getByRole('button', { name: 'Confirm', exact: true }).click(); };
    await action('Request Approval'); await poll(scenario.approval, task => task.approvals.some(approval => approval.state === 'PENDING'));
    await api(taskPath(scenario.approval) + '/approval-requests/approve', { method: 'POST', data: {} }, 403);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog').last().getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
    await page.getByPlaceholder('Reason for cancelling (required)...').fill('P12 explicit cancellation');
    await page.getByRole('dialog').last().getByRole('button', { name: 'Confirm', exact: true }).click();
    await poll(scenario.approval, task => task.approvals.some(approval => approval.state === 'CANCELLED'));
    await action('Request Approval');
    await page.evaluate(() => localStorage.clear()); await login(fixture.actors.contributor);
    await detail(scenario.approval); await action('Reject'); await poll(scenario.approval, task => task.approvals.some(approval => approval.state === 'REJECTED'));
    await page.evaluate(() => localStorage.clear()); await login(fixture.actors.pm); await detail(scenario.approval); await action('Request Approval');
    await page.evaluate(() => localStorage.clear()); await login(fixture.actors.contributor); await detail(scenario.approval); await action('Approve');
    await poll(scenario.approval, task => task.approvals.some(approval => approval.state === 'APPROVED'));
    await page.reload(); await expect(page.getByText('P12 browser comment persisted', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').first().getByRole('button', { name: 'Request Approval', exact: true })).toBeDisabled();
    await page.evaluate(() => localStorage.clear()); await login(fixture.actors.creator); await detail(scenario.approval); await action('Request Approval');
    await page.getByRole('dialog').first().getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByPlaceholder('Reason for cancelling (required)...').fill('P12 creator cancels own request'); await page.getByRole('dialog').last().getByRole('button', { name: 'Confirm', exact: true }).click();
    await poll(scenario.approval, task => task.approvals[0].state === 'CANCELLED');
  });

  await record('My Tasks uses shared editor with Contributor authority', async () => {
    await context.clearCookies(); await page.evaluate(() => localStorage.clear()); await login(fixture.actors.contributor);
    await page.goto(origin + '/tasks/my'); await page.getByText(title, { exact: true }).first().click();
    await page.getByRole('button', { name: /^Edit/ }).first().click();
    await expect(page.locator('#task-title')).toBeEnabled(); await expect(page.locator('#task-team')).toBeDisabled();
    await expect(page.getByLabel('Eligible assignees')).toHaveCount(0);
    title = 'P12 My Tasks edited'; await page.locator('#task-title').fill(title); await save();
    await poll(scenario.manual, task => task.title === title);
    await page.reload(); await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  });

  await record('Contributor creates content without management/assignment authority', async () => {
    await page.goto(origin + projectPath + '?tab=board&createTask=true'); await expect(page.locator('#task-title')).toBeEnabled();
    await page.locator('#task-title').fill('P12 browser contributor-created');
    await page.locator('#task-team').selectOption(fixture.teamId); await page.locator('#task-status').selectOption(scenario.statuses.find(s => s.semanticCategory === 'NOT_STARTED').id);
    await expect(page.getByLabel('Eligible assignees')).toHaveCount(0); await expect(page.locator('#requires-approval')).toBeDisabled();
    await page.getByRole('dialog').last().getByRole('button', { name: 'Create Task', exact: true }).click(); await expect(page.locator('#task-title')).toHaveCount(0);
    const task = (await api('/api/projects/' + scenario.projectId + '/tasks')).find(task => task.title === 'P12 browser contributor-created');
    assert.ok(task); await api(taskPath(task.id) + '/assignees', { method: 'POST', data: { projectMembershipId: fixture.actors.assignee.projectMembershipId } }, 403);
  });

  await record('read-all-only Board/Editor and direct mutation denial', async () => {
    await page.evaluate(() => localStorage.clear()); await login(fixture.actors.readAll); await board();
    await expect(card(title)).toHaveAttribute('draggable', 'false');
    const dialog = await detail(scenario.manual); await expect(dialog.getByRole('button', { name: /^Edit/ })).toBeDisabled();
    await expect(dialog.locator('#transition-status')).toBeDisabled();
    await expect(dialog.locator('input[type=range]')).toBeDisabled();
    await expect(dialog.getByPlaceholder('Add a checklist item...')).toBeDisabled();
    await expect(dialog.getByPlaceholder('Write a comment...')).toBeDisabled();
    await api(taskPath(scenario.manual), { method: 'PATCH', data: { title: 'Must not persist' } }, 403);
    assert.equal((await read()).title, title);
    await page.keyboard.press('Escape'); await page.keyboard.press('c'); await expect(page.locator('#task-title')).toHaveCount(0);
  });

  await record('membership suspension while modal is open rejects stale actor and target', async () => {
    await page.evaluate(() => localStorage.clear()); await login(fixture.actors.contributor);
    const dialog = await detail(scenario.manual); await expect(dialog.getByLabel('Manual progress')).toBeEnabled();
    const signed = await context.request.post(fixture.baseURL + '/api/auth/login', { data: { email: fixture.actors.pm.email, password: fixture.password } }); assert.ok(signed.ok());
    const credentials = await signed.json(); preResetRefresh = credentials.refreshToken;
    const headers = { Authorization: 'Bearer ' + credentials.accessToken, 'x-organization-id': fixture.organizationId };
    const suspended = await context.request.post(fixture.baseURL + '/api/organizations/' + fixture.organizationId + '/members/' + fixture.actors.contributor.id + '/suspend', { headers }); assert.ok(suspended.ok());
    await dialog.getByLabel('Manual progress').fill('70');
    const denied = page.waitForResponse(response => response.url().endsWith(taskPath(scenario.manual) + '/manual-progress') && response.status() === 403);
    await dialog.getByRole('button', { name: 'Update Progress', exact: true }).click(); await denied;
    await expect(page.getByRole('alert').first()).toBeVisible();
    const saved = await context.request.get(fixture.baseURL + taskPath(scenario.manual), { headers }); assert.equal((await saved.json()).manualProgress, 65);
    const invalidTarget = await context.request.post(fixture.baseURL + taskPath(scenario.checklist) + '/assignees', { headers, data: { projectMembershipId: fixture.actors.contributor.projectMembershipId } }); assert.equal(invalidTarget.status(), 409); assert.equal((await invalidTarget.json()).code, 'TASK_MEMBER_INELIGIBLE');
  });

  await record('invitation wrong-account/expired/revoked and no-workspace acceptance', async () => {
    await page.goto(origin + '/accept-invite?token=' + encodeURIComponent(fixture.invites.valid.token));
    await expect(page.getByRole('button', { name: 'Return to workspace setup' })).toBeVisible();
    for (const kind of ['expired', 'revoked']) {
      await page.evaluate(() => localStorage.clear()); await login(fixture.invites[kind]);
      await page.goto(origin + '/accept-invite?token=' + encodeURIComponent(fixture.invites[kind].token));
      await expect(page.getByRole('button', { name: 'Return to workspace setup' })).toBeVisible();
      await expect(page.locator('main')).toContainText(kind === 'expired' ? /expired/i : /revoked|pending|active/i);
    }
    await page.evaluate(() => localStorage.clear()); await login(fixture.invites.valid);
    await page.goto(origin + '/accept-invite?token=' + encodeURIComponent(fixture.invites.valid.token));
    await expect(page).toHaveURL(/dashboard$/, { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Active workspace' })).toContainText('P12 baseline');
    await api(taskPath(scenario.manual), { method: 'PATCH', data: { title: 'Org role must not grant Task mutation' } }, 403);
    await page.goto(origin + '/accept-invite?token=' + encodeURIComponent(fixture.invites.valid.token));
    await expect(page).toHaveURL(/dashboard$/, { timeout: 15000 });
  });

  await record('reset wrong/code success/reload and credential revocation through real UI', async () => {
    await page.evaluate(() => localStorage.clear()); await page.goto(origin + '/forgot-password');
    await page.getByLabel('Email Address').fill(fixture.actors.pm.email);
    await page.getByRole('button', { name: 'Request Reset Code' }).click(); await expect(page.getByLabel('Reset Code')).toBeVisible();
    const response = await context.request.get(fixture.baseURL + '/__p12/reset-code?email=' + encodeURIComponent(fixture.actors.pm.email), { headers: { 'x-p12-harness': fixture.controlKey } });
    const { code } = await response.json(); assert.ok(code);
    await page.getByLabel('Reset Code').fill(code === '111111' ? '222222' : '111111'); await page.getByLabel('New Password', { exact: true }).fill('P12-new-browser-password!');
    await page.getByLabel('Confirm Password').fill('P12-new-browser-password!'); await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('invalid or expired');
    await page.getByLabel('Reset Code').fill(code); await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Password Reset Complete' })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: 'Forgot Password' })).toBeVisible();
    await login(fixture.actors.pm, 'P12-new-browser-password!');
    const revoked = await context.request.post(fixture.baseURL + '/api/auth/refresh', { headers: { Authorization: 'Bearer ' + preResetRefresh } }); assert.equal(revoked.status(), 403);
  });

  await record('expired access single-flight and terminal refresh logout/cache purge', async () => {
    await page.evaluate(token => localStorage.setItem('token', token), fixture.expiredAccessToken);
    let refreshes = 0;
    page.on('request', request => { if (request.url().endsWith('/api/auth/refresh')) refreshes++; });
    await page.evaluate(async () => {
      const { default: client } = await import('/src/utils/axiosInstance.js');
      await Promise.all(['/api/projects', '/api/tasks/my', '/api/dashboard'].map(url => client.get(url)));
    });
    await board(); await expect(card(title)).toBeVisible(); assert.equal(refreshes, 1);
    await page.evaluate(({ access, refresh }) => { localStorage.setItem('token', access); localStorage.setItem('refreshToken', refresh); }, { access: fixture.expiredAccessToken, refresh: fixture.expiredRefreshToken });
    await page.goto(origin + '/dashboard'); await expect(page).toHaveURL(/\/login$/);
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), null);
  });

  await record('empty account creates workspace/General Team and reloads discovery', async () => {
    await login(fixture.emptyActor); await page.goto(origin + '/workspace/onboarding');
    await page.getByLabel(/Workspace name/i).fill('P12 browser new workspace');
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/); await page.reload(); await expect(page.getByRole('button', { name: 'Active workspace' })).toContainText('P12 browser new workspace');
    const currentOrg = await page.evaluate(() => localStorage.getItem('activeOrganizationId'));
    const teams = await api('/api/teams', { organizationId: currentOrg }); assert.ok(teams.some(team => team.name === 'General'));
  });

  await record('real Team/Project/participating-Team bootstrap and empty project guidance', async () => {
    const organizationId = await page.evaluate(() => localStorage.getItem('activeOrganizationId'));
    await page.goto(origin + '/teams'); await page.getByRole('button', { name: /New Team|Create Team/i }).first().click();
    await page.locator('#teamName').fill('P12 browser bootstrap team');
    await page.getByRole('dialog').getByRole('button', { name: 'Create Team', exact: true }).click(); await expect(page.locator('#teamName')).toHaveCount(0);
    const team = (await api('/api/teams', { organizationId })).find(team => team.name === 'P12 browser bootstrap team'); assert.ok(team);
    const teamUrl = fixture.baseURL + '/api/teams';
    let releaseTeams, teamsArrived; const delayedTeams = new Promise(resolve => { releaseTeams = resolve; }); const teamsStarted = new Promise(resolve => { teamsArrived = resolve; });
    await page.route(teamUrl, async route => { const response = await route.fetch(); teamsArrived(); await delayedTeams; await route.fulfill({ response }); });
    try {
      await page.goto(origin + '/projects'); await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
      await teamsStarted; await page.locator('#project-name').fill('P12 browser bootstrap project'); releaseTeams();
      await expect(page.locator('#primary-department').getByRole('option', { name: 'P12 browser bootstrap team', exact: true })).toHaveCount(1);
      await expect(page.locator('#project-name')).toHaveValue('P12 browser bootstrap project');
    } finally { releaseTeams(); await page.unroute(teamUrl); }
    await page.getByRole('dialog').getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect.poll(async () => (await api('/api/projects', { organizationId })).some(project => project.name === 'P12 browser bootstrap project')).toBe(true);
    const project = (await api('/api/projects', { organizationId })).find(project => project.name === 'P12 browser bootstrap project');
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.goto(origin + '/projects/' + project.id + '?tab=participants');
    await page.getByRole('button', { name: 'Add Team', exact: true }).click(); await page.locator('#team-select').selectOption(team.id);
    await page.getByRole('dialog').getByRole('button', { name: 'Add Team', exact: true }).click(); await expect(page.locator('#team-select')).toHaveCount(0);
    const projectTeams = await api('/api/projects/' + project.id + '/teams', { organizationId }); assert.ok(projectTeams.some(entry => entry.teamId === team.id || entry.id === team.id));
    const members = await api('/api/projects/' + project.id + '/members', { organizationId }); assert.ok(members.some(member => member.user?.id === fixture.emptyActor.id && member.role === 'PROJECT_MANAGER'));
    await page.goto(origin + '/projects/' + project.id + '?tab=board'); await expect(page.getByText(/No tasks|Create.*first task|No tasks in this status/i).first()).toBeVisible();
    await page.reload(); await expect(page.getByRole('button', { name: 'Create Task', exact: true })).toBeVisible();
  });

  await record('Project completion/archive denies stale modal writes and retains authorized downloads', async () => {
    const organizationId = await page.evaluate(() => localStorage.getItem('activeOrganizationId'));
    const project = (await api('/api/projects', { organizationId })).find(project => project.name === 'P12 browser bootstrap project');
    const teams = await api('/api/teams', { organizationId }); const general = teams.find(team => team.name === 'General');
    const statuses = await api('/api/projects/' + project.id + '/statuses', { organizationId });
    await page.getByRole('button', { name: 'Activate', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await api('/api/projects/' + project.id, { organizationId })).state).toBe('ACTIVE');
    await page.goto(origin + '/projects/' + project.id + '?tab=board&createTask=true'); await page.locator('#task-title').fill('P12 lifecycle task');
    await page.locator('#task-team').selectOption(general.id); await page.locator('#task-status').selectOption(statuses.find(status => status.semanticCategory === 'NOT_STARTED').id);
    await page.getByRole('dialog').last().getByRole('button', { name: 'Create Task', exact: true }).click(); await expect(page.locator('#task-title')).toHaveCount(0);
    const task = (await api('/api/projects/' + project.id + '/tasks', { organizationId })).find(task => task.title === 'P12 lifecycle task');
    await page.goto(origin + '/projects/' + project.id + '?tab=board&task=' + task.id); let dialog = page.getByRole('dialog').first();
    const activeStatus = statuses.find(status => status.semanticCategory === 'IN_PROGRESS');
    await dialog.locator('#transition-status').selectOption(activeStatus.id); await dialog.getByRole('button', { name: 'Move', exact: true }).click();
    await expect.poll(async () => (await api('/api/projects/' + project.id + '/tasks/' + task.id, { organizationId })).statusId).toBe(activeStatus.id);
    await expect(dialog.getByRole('button', { name: /^(Move|Moving\.\.\.)$/ })).toHaveCount(0);
    await expect(dialog.locator('#transition-status')).toHaveValue(activeStatus.id);
    await dialog.locator('#transition-status').selectOption(statuses.find(status => status.semanticCategory === 'COMPLETED').id); await dialog.getByRole('button', { name: 'Move', exact: true }).click();
    await expect.poll(async () => (await api('/api/projects/' + project.id + '/tasks/' + task.id, { organizationId })).effectiveProgress).toBe(100);
    await dialog.getByLabel('Select file').setInputFiles({ name: 'p12-terminal.txt', mimeType: 'text/plain', buffer: Buffer.from('terminal read bytes') }); await dialog.getByRole('button', { name: 'Upload file', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Download p12-terminal.txt' })).toBeVisible();
    await dialog.getByLabel('Select file').setInputFiles({ name: 'p12-stale.txt', mimeType: 'text/plain', buffer: Buffer.from('must not be stored') });
    await api('/api/projects/' + project.id + '/complete', { method: 'POST', organizationId });
    const denial = page.waitForResponse(response => response.url().endsWith('/tasks/' + task.id + '/attachments') && response.status() === 409);
    await dialog.getByRole('button', { name: 'Upload file', exact: true }).click(); await denial;
    await expect(dialog.getByLabel('Select file')).toBeDisabled(); await expect(dialog.getByRole('button', { name: 'Remove p12-terminal.txt' })).toBeDisabled();
    const files = await api('/api/projects/' + project.id + '/tasks/' + task.id + '/attachments', { organizationId }); assert.equal(files.length, 1);
    await api('/api/projects/' + project.id + '/archive', { method: 'POST', organizationId });
    await page.reload(); dialog = page.getByRole('dialog').first(); await expect(dialog.locator('#transition-status')).toBeDisabled(); await expect(dialog.getByLabel('Select file')).toBeDisabled();
    const pending = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download p12-terminal.txt' }).click(); assert.equal((await readFile(await (await pending).path())).toString(), 'terminal read bytes');
    await api('/api/projects/' + project.id + '/tasks/' + task.id, { method: 'PATCH', organizationId, data: { title: 'Must remain read-only' } }, 409);
  });

  assert.equal(results.length, bootstrapOnly ? 3 : 22); assert.equal(signupRequests, 0);
  await writeFile(resolve(evidenceRoot, bootstrapOnly ? 'results-bootstrap.json' : 'results.json'), JSON.stringify({ date: '2026-10-14', scope: bootstrapOnly ? 'bootstrap diagnostic only' : 'full integrated acceptance', browser: await browser.version(), apiRequests, provider: 'test-only mail; real PostgreSQL/Redis; isolated local file storage', signup: 'excluded', cases: results }, null, 2));
  console.log(bootstrapOnly ? 'P12 browser bootstrap diagnostic passed' : 'P12 browser integrated acceptance passed');
} catch (error) {
  let message = String(error.message).replaceAll(fixture.password, '[REDACTED]').replaceAll('P12-new-browser-password!', '[REDACTED]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[REDACTED_TOKEN]');
  for (const invite of Object.values(fixture.invites || {})) message = message.replaceAll(invite.token, '[REDACTED_INVITATION]');
  message = message.replace(/\b\d{6}\b/g, '[REDACTED_CODE]');
  console.error(`P12 browser failed in ${currentCase}: ${message}`);
  if (page) {
    await page.screenshot({ path: resolve(evidenceRoot, 'failure.png'), mask: [page.locator('input')] }).catch(() => {});
    await writeFile(resolve(evidenceRoot, 'failure.txt'), (await page.locator('body').innerText()).replaceAll(fixture.password, '[REDACTED]'));
  }
  process.exitCode = 1;
} finally { await browser?.close(); await vite.close(); }
