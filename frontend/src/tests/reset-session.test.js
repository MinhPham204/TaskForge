import assert from 'node:assert/strict';
import axios from 'axios';
import React from 'react';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
globalThis.window = { location: { href: '' } };
const ok = (config, data = {}) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const denied = (config, status, data = { message: 'Test denial' }) => { throw new axios.AxiosError('Rejected', 'ERR_BAD_RESPONSE', config, null, { config, data, status, headers: {} }); };

const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
    const { default: Forgot } = await server.ssrLoadModule('/src/pages/Auth/ForgotPassword.jsx');
    const { default: uiClient } = await server.ssrLoadModule('/src/utils/axiosInstance.js');
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Forgot)));
    assert.match(html, /Reloading this page starts a new request/);
    // Drive actual component callbacks with deterministic hooks; browser acceptance is P12-11.
    const dispatcher = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
    let slots = [], cursor = 0, tree;
    const hooks = {
        useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
        useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
        useEffect() { cursor++; },
    };
    const render = () => { const previous = dispatcher.current; cursor = 0; dispatcher.current = hooks; try { tree = Forgot(); } finally { dispatcher.current = previous; } return tree; };
    const all = element => [element, ...React.Children.toArray(element?.props?.children).flatMap(child => typeof child === 'object' ? all(child) : [])];
    const find = predicate => all(tree).find(predicate);
    const field = (id, value) => { find(element => element.props?.id === id).props.onChange({ target: { value } }); render(); };
    const submit = () => find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    const text = element => React.Children.toArray(element?.props?.children).filter(child => typeof child === 'string').join('');
    values.set('token', 'unrelated-account'); values.set('refreshToken', 'unrelated-refresh');
    let requests = [], release;
    uiClient.defaults.adapter = config => {
        assert.equal(config.headers.get('Authorization'), undefined);
        assert.equal(config.headers.get('x-organization-id'), undefined);
        requests.push({ url: config.url, body: JSON.parse(config.data) });
        return new Promise(resolve => { release = () => resolve(ok(config, { message: 'If eligible, check your email.', retryAfter: 60 })); });
    };
    render(); field('reset-email', 'person@example.test');
    const pending = submit(); render(); await submit();
    assert.equal(find(element => element.type === 'button' && element.props.type === 'submit').props.disabled, true);
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(requests.length, 1); assert.equal(find(element => element.props?.id === 'reset-code'), undefined);
    release(); await pending; render();
    assert.equal(find(element => element.props?.id === 'reset-email').props.disabled, true);
    assert.match(text(find(element => element.type === 'button' && text(element).startsWith('Resend'))), /60s/);
    field('reset-code', '123456'); field('reset-password', 'new-password'); field('reset-confirm', 'different-password');
    await submit(); render(); assert.equal(requests.length, 1); assert.match(text(find(element => element.props?.role === 'alert')), /matching passwords/);
    field('reset-confirm', 'new-password');
    uiClient.defaults.adapter = async config => { requests.push({ url: config.url, body: JSON.parse(config.data) }); return denied(config, 400, { code: 'RESET_CODE_INVALID', message: 'Reset code is invalid or expired. Request a new code.' }); };
    await submit(); render();
    assert.match(text(find(element => element.props?.role === 'alert')), /expired/);
    assert.equal(find(element => element.props?.id === 'reset-password').props.value, 'new-password');
    assert.equal(values.get('token'), 'unrelated-account');
    uiClient.defaults.adapter = async config => { requests.push({ url: config.url, body: JSON.parse(config.data) }); return ok(config, { message: 'Password reset successfully.' }); };
    await submit(); render();
    assert.equal(find(element => element.type === 'form'), undefined);
    assert.match(text(find(element => element.type === 'h1')), /Complete/);
    assert.deepEqual(requests.at(-1).body, { email: 'person@example.test', otp: '123456', newPassword: 'new-password', confirmPassword: 'new-password' });
    assert.equal([...values.keys()].some(key => /password|challenge|otp/i.test(key)), false);
    slots = []; render(); assert.equal(find(element => element.props?.id === 'reset-email').props.value, '');
    assert.equal(find(element => element.props?.id === 'reset-code'), undefined);
} finally { await server.close(); }

const { default: client } = await import('../utils/axiosInstance.js');
const { store } = await import('../store/index.js');
const { setCredentials, clearUser, fetchProfile, fetchMyOrganizations } = await import('../store/authSlice.js');
const { authApi } = await import('../services/authApi.js');
const { taskApi } = await import('../services/taskApi.js');
const session = () => { values.clear(); window.location.href = ''; store.dispatch(setCredentials({ user: { id: 'test-user' }, accessToken: 'test-access', refreshToken: 'test-refresh' })); };
const oldAdapter = client.defaults.adapter, oldRaw = axios.defaults.adapter;
try {
    session(); let refreshes = 0;
    axios.defaults.adapter = async config => { refreshes++; return ok(config, { accessToken: 'fresh', refreshToken: 'fresh-refresh' }); };
    for (const path of ['/api/auth/forgot-password', '/api/auth/reset-password']) {
        client.defaults.adapter = async config => { assert.equal(config.headers.get('Authorization'), undefined); assert.equal(config.headers.get('x-organization-id'), undefined); return denied(config, 401); };
        await assert.rejects(client.post(path, {}));
    }
    assert.equal(refreshes, 0); assert.equal(values.get('token'), 'test-access');
    for (const status of [401, 403]) {
        session(); await store.dispatch(taskApi.util.upsertQueryData('getProjectTaskDetail', { projectId: 'p', taskId: 't' }, { id: 't' }));
        await store.dispatch(authApi.util.upsertQueryData('getProfile', undefined, { id: 'test-user' }));
        client.defaults.adapter = async config => denied(config, 401);
        axios.defaults.adapter = async config => denied(config, status);
        await assert.rejects(client.get('/api/projects/p'));
        assert.equal(store.getState().auth.user, null); assert.equal(Object.keys(store.getState().taskApi.queries).length, 0); assert.equal(Object.keys(store.getState().authApi.queries).length, 0);
        assert.equal(values.get('token'), undefined); assert.equal(window.location.href, '/login');
    }
    for (const failure of ['network', 'service']) {
        session(); client.defaults.adapter = async config => denied(config, 401);
        axios.defaults.adapter = async config => { if (failure === 'network') throw new axios.AxiosError('Network unavailable', 'ERR_NETWORK', config); return denied(config, 503); };
        await assert.rejects(client.get('/api/projects/p'));
        assert.equal(values.get('token'), 'test-access'); assert.equal(store.getState().auth.user.id, 'test-user'); assert.equal(window.location.href, '');
        axios.defaults.adapter = async config => ok(config, { accessToken: 'recovered', refreshToken: 'recovered-refresh' });
        client.defaults.adapter = async config => config._retry ? ok(config) : denied(config, 401);
        await client.get('/api/projects/p'); assert.equal(values.get('token'), 'recovered'); assert.equal(store.getState().auth.accessToken, 'recovered'); assert.equal(store.getState().auth.refreshToken, 'recovered-refresh');
    }
    session(); client.defaults.adapter = async config => denied(config, 401);
    axios.defaults.adapter = async config => ok(config, { accessToken: 'missing-refresh' });
    await assert.rejects(client.get('/api/projects/p')); assert.equal(values.get('token'), undefined);
    session(); client.defaults.adapter = async config => denied(config, 403);
    await assert.rejects(client.post('/api/auth/refresh')); assert.equal(values.get('token'), undefined);
    // Hydrated profile bootstrap must preserve selection until discovery verifies membership.
    store.dispatch(clearUser()); session(); values.set('activeOrganizationId', 'selected-second');
    client.defaults.adapter = async config => ok(config, config.url.endsWith('/auth/me') ? { id: 'test-user' } : [{ organizationId: 'first' }, { organizationId: 'selected-second' }]);
    await store.dispatch(fetchProfile()); assert.equal(values.get('activeOrganizationId'), 'selected-second');
    client.defaults.adapter = async config => { throw new axios.AxiosError('Bootstrap aborted', 'ERR_CANCELED', config); };
    await store.dispatch(fetchMyOrganizations()); assert.equal(values.get('activeOrganizationId'), 'selected-second');
    client.defaults.adapter = async config => ok(config, [{ organizationId: 'first' }, { organizationId: 'selected-second' }]);
    await store.dispatch(fetchMyOrganizations()); assert.equal(store.getState().auth.activeOrganizationId, 'selected-second');
    // Profile/discovery thunks must preserve sessions on temporary failures and ignore old accounts.
    session();
    await store.dispatch(taskApi.util.upsertQueryData('getProjectTaskDetail', { projectId: 'p', taskId: 't' }, { id: 't' }));
    client.defaults.adapter = async config => denied(config, 503);
    await store.dispatch(fetchProfile());
    assert.equal(store.getState().auth.user.id, 'test-user'); assert.equal(values.get('token'), 'test-access');
    assert.equal(Object.keys(store.getState().taskApi.queries).length, 1);
    for (const [thunk, outcome] of [[fetchProfile, 'success'], [fetchProfile, 'denial'], [fetchMyOrganizations, 'success']]) {
        session(); let release;
        client.defaults.adapter = config => new Promise((resolve, reject) => { release = () => outcome === 'denial' ? reject(new axios.AxiosError('Denied', '', config, null, { config, status: 403, data: { message: 'Old account denied' }, headers: {} })) : resolve(ok(config, thunk === fetchProfile ? { id: 'old-user' } : [{ organizationId: 'old-org' }])); });
        const request = store.dispatch(thunk());
        while (!release) await new Promise(resolve => setTimeout(resolve, 0));
        store.dispatch(setCredentials({ user: { id: 'new-user' }, accessToken: 'new-account-access', refreshToken: 'new-account-refresh' }));
        await store.dispatch(authApi.util.upsertQueryData('getProfile', undefined, { id: 'new-user' }));
        release(); await request;
        assert.equal(store.getState().auth.user.id, 'new-user'); assert.equal(values.get('token'), 'new-account-access');
        assert.deepEqual(store.getState().auth.organizations, []);
        assert.equal(authApi.endpoints.getProfile.select()(store.getState()).data.id, 'new-user');
    }
    session(); client.defaults.adapter = async config => denied(config, 403);
    await store.dispatch(fetchProfile()); assert.equal(store.getState().auth.user, null); assert.equal(values.get('token'), undefined);
    console.log('reset-session.test.js passed (actual ForgotPassword JSX/events, pending/denial/success/reload, public isolation, terminal cache purge, transient refresh recovery)');
} finally { client.defaults.adapter = oldAdapter; axios.defaults.adapter = oldRaw; }
