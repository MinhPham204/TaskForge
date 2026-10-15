// Diagnostic baseline; known-bug assertions must be replaced by owning fix tests.
// Actual component SSR + actual baseQuery/Axios transform, no network or Dev Mock.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import axios from 'axios';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Card } = await server.ssrLoadModule('/src/pages/Projects/components/board/BoardTaskCard.jsx');
  for (const [effectiveProgress, semanticCategory, observed] of [[45, 'IN_PROGRESS', 45], [33, 'IN_PROGRESS', 33], [100, 'COMPLETED', 100]]) {
    const html = renderToStaticMarkup(React.createElement(Card, { task: {
      id: 'p12-card', title: 'Baseline', effectiveProgress, manualProgress: 45, semanticCategory,
      owningTeamName: 'Baseline Team', dueAt: '2026-12-01T09:30:00.000Z', assigneeProjectMembershipIds: ['p12-assignee'],
    } }));
    assert.match(html, new RegExp(`>${observed}%<`));
    console.log(JSON.stringify({ case: 'actual Card SSR', expected: effectiveProgress, observed, semanticCategory }));
  }
  let captured;
  const client = axios.create({ headers: { 'Content-Type': 'application/json' }, adapter: async config => {
    captured = { contentType: config.headers.get('Content-Type'), bodyIsFormData: config.data instanceof FormData,
      bodyType: typeof config.data };
    return { status: 200, statusText: 'OK', headers: {}, config, data: { acceptedByTestAdapter: true } };
  } });
  const source = await readFile(new URL('../src/services/baseQuery.js', import.meta.url), 'utf8');
  const executable = source.replace(/^import .*;\r?\n/gm, '').replace('export const axiosBaseQuery', 'const axiosBaseQuery');
  const query = new Function('axiosInstance', 'isDevMockActive', 'handleDevMockRequest', `${executable}\nreturn axiosBaseQuery;`)(client, () => false, () => null);
  const data = new FormData();
  data.append('file', new Blob(['p12 harmless text'], { type: 'text/plain' }), 'baseline.txt');
  await query()({ url: '/test-only-no-network', method: 'post', data, headers: { 'Content-Type': undefined } }, { getState: () => ({}) });
  assert.equal(captured.bodyIsFormData, true); // P12-03 forwards the consumer's multipart override.
  console.log(JSON.stringify({ case: 'actual baseQuery + Axios adapter', expected: 'multipart FormData', observed: captured }));
  await query()({ url: '/test-only-no-network', method: 'patch', data: { title: 'Content' } }, { getState: () => ({}) });
  assert.equal(captured.contentType, 'application/json');
  console.log(JSON.stringify({ case: 'JSON control', observed: captured }));
} finally { await server.close(); }
