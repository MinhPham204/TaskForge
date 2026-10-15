// Called by the real HTTP integration suite with sanitized Task response on stdin.
import assert from 'node:assert/strict';
import { getTaskCapability, readTaskContract } from '../src/utils/taskCapabilities.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const task = JSON.parse(input);
const canonical = readTaskContract(task);
assert.equal(typeof canonical.milestoneId, 'string');
assert.equal(canonical.effectiveProgress, 45);
assert.equal(canonical.manualProgress, 45);
assert.equal(canonical.dueAt, '2026-12-01T09:30:00.000Z');
assert.equal(typeof canonical.owningTeamName, 'string');
assert.ok(Array.isArray(canonical.assigneeProjectMembershipIds));
assert.equal(getTaskCapability(task, 'editContent').allowed, true);
assert.equal(getTaskCapability(task, 'editManagement').reason, 'PROJECT_MANAGER_REQUIRED');
assert.equal(getTaskCapability(task, 'assign').allowed, false);
assert.equal(getTaskCapability({}, 'editContent').allowed, false);
process.stdout.write('canonical Task HTTP consumer contract passed\n');
