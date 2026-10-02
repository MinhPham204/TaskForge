import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log('Starting Stitch Dashboard UI Verification (P10-06)...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Verify DashboardPage.jsx source code
const dashboardSrc = readFileSync(join(__dirname, '../pages/Dashboard/DashboardPage.jsx'), 'utf-8');

// Check KPI cards
assert(dashboardSrc.includes('Active Assignments'), 'Must contain Active Assignments KPI card');
assert(dashboardSrc.includes('Due Today'), 'Must contain Due Today KPI card');
assert(dashboardSrc.includes('Overdue Tasks'), 'Must contain Overdue Tasks KPI card');
assert(dashboardSrc.includes('Approval Requests'), 'Must contain Approval Requests KPI card');

// Check Smart zero-state
assert(dashboardSrc.includes('All milestones healthy'), 'Must contain smart zero-state for overdue tasks');
assert(dashboardSrc.includes('On track'), 'Must contain On track badge for zero overdue');

// Check Visual Analytics Cards
assert(dashboardSrc.includes('PriorityDistributionCard'), 'Must integrate PriorityDistributionCard');
assert(dashboardSrc.includes('WorkflowStagesCard'), 'Must integrate WorkflowStagesCard');

// Check 7-Day Timeline and Approval Queue
assert(dashboardSrc.includes('DashboardSchedule'), 'Must integrate DashboardSchedule timeline');
assert(dashboardSrc.includes('Approval Queue'), 'Must contain Approval Queue section');
assert(dashboardSrc.includes('handleQuickApproval'), 'Must support interactive quick approval/rejection');

// Check Linear-style task rows & Active Projects
assert(dashboardSrc.includes('Assigned to You'), 'Must contain Assigned to You section');
assert(dashboardSrc.includes('Active Projects'), 'Must contain Active Projects section');
assert(dashboardSrc.includes('PriorityBars'), 'Must use Linear cellular priority bars');
assert(dashboardSrc.includes('LinearStatusIcon'), 'Must use Linear discrete status icons');

console.log('✓ 1. DashboardPage.jsx conforms to Stitch reference layout and components');

// 2. Verify PriorityBars and LinearStatusIcon components
const priorityBarsSrc = readFileSync(join(__dirname, '../components/task/PriorityBars.jsx'), 'utf-8');
assert(priorityBarsSrc.includes('export const PriorityBars'), 'Exports PriorityBars component');
assert(priorityBarsSrc.includes('export const LinearStatusIcon'), 'Exports LinearStatusIcon component');
assert(priorityBarsSrc.includes('URGENT'), 'Handles Urgent priority');
assert(priorityBarsSrc.includes('HIGH'), 'Handles High priority');
assert(priorityBarsSrc.includes('MEDIUM'), 'Handles Medium priority');
assert(priorityBarsSrc.includes('LOW'), 'Handles Low priority');
console.log('✓ 2. PriorityBars.jsx correctly implements cellular bars and status icons');

// 3. Verify DashboardCharts.jsx
const chartsSrc = readFileSync(join(__dirname, '../pages/Dashboard/components/DashboardCharts.jsx'), 'utf-8');
assert(chartsSrc.includes('export const PriorityDistributionCard'), 'Exports PriorityDistributionCard');
assert(chartsSrc.includes('export const WorkflowStagesCard'), 'Exports WorkflowStagesCard');
assert(chartsSrc.includes('Segmented Bar'), 'Implements segmented workload bar');
assert(chartsSrc.includes('Donut'), 'Implements SVG Donut graphic');
console.log('✓ 3. DashboardCharts.jsx implements craft visual analytics');

// 4. Verify DashboardSchedule.jsx
const scheduleSrc = readFileSync(join(__dirname, '../pages/Dashboard/components/DashboardSchedule.jsx'), 'utf-8');
assert(scheduleSrc.includes('7-Day Timeline'), 'Implements 7-Day Timeline');
assert(scheduleSrc.includes('grid-cols-7'), 'Implements 7-column day strip');
assert(scheduleSrc.includes('Full Schedule →'), 'Contains link to full schedule');
console.log('✓ 4. DashboardSchedule.jsx implements 7-Day Timeline strip');

console.log('\nAll Stitch Dashboard UI checks PASSED successfully!');
