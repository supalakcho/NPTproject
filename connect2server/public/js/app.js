import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from './api.js';

const $ = (id) => document.getElementById(id);

// Build DOM with textContent only, so server-supplied strings can never be parsed as HTML.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el[k] = v;
  }
  el.append(...children.filter((c) => c != null));
  return el;
}

const state = {
  me: null,
  roles: [],
  users: { page: 1, sort: 'createdAt', order: 'desc' },
  audit: { page: 1 },
};
const can = (perm) => state.me?.permissions.includes(perm);
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');

function showError(el, err) {
  const fields = err instanceof ApiError && err.details?.map((d) => `${d.field}: ${d.message}`).join('; ');
  el.textContent = fields || err.message;
}

let bannerTimer;
function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (el.hidden = true), 4000);
}

// ---------- session ----------
function showLogin() {
  setToken(null);
  state.me = null;
  $('app-view').hidden = true;
  $('login-view').hidden = false;
}
setUnauthorizedHandler(() => {
  showLogin();
  $('login-error').textContent = 'Your session has ended. Please sign in again.';
});

async function enterApp() {
  state.me = (await api('GET', '/auth/me')).data;
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  $('whoami').textContent = `${state.me.username} (${state.me.roles.join(', ')})`;
  $('new-user-btn').hidden = !can('user:create');
  $('audit-tab').hidden = !can('audit:read');
  switchTab('users');

  if (can('role:read')) {
    state.roles = (await api('GET', '/roles')).data;
    const filter = $('filter-role');
    filter.replaceChildren(h('option', { value: '' }, 'All roles'),
      ...state.roles.map((r) => h('option', { value: r.name }, r.name)));
  }
  if (can('user:read')) await loadUsers();
  else $('users-body').replaceChildren(h('tr', {}, h('td', { colSpan: 7 }, 'You do not have access to the user list.')));
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  $('login-error').textContent = '';
  try {
    const { data } = await api('POST', '/auth/login', {
      body: { username: form.username.value, password: form.password.value },
    });
    setToken(data.accessToken);
    form.reset();
    await enterApp();
  } catch (err) {
    showError($('login-error'), err);
  }
});

$('logout-btn').addEventListener('click', async () => {
  try { await api('POST', '/auth/logout'); } catch { /* token may already be invalid */ }
  showLogin();
});

// ---------- tabs ----------
function switchTab(name) {
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === name);
  $('users-tab').hidden = name !== 'users';
  $('audit-tab-body').hidden = name !== 'audit';
  if (name === 'audit') loadAudit();
}
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => switchTab(b.dataset.tab));

// ---------- users list ----------
async function loadUsers() {
  const { page, sort, order } = state.users;
  try {
    const { data, meta } = await api('GET', '/users', {
      query: { page, limit: 10, sort, order, search: $('search').value.trim(), role: $('filter-role').value, status: $('filter-status').value },
    });
    $('users-body').replaceChildren(...data.map(userRow));
    $('page-info').textContent = `Page ${meta.page} of ${meta.totalPages} (${meta.total} users)`;
    $('prev-page').disabled = meta.page <= 1;
    $('next-page').disabled = meta.page >= meta.totalPages;
  } catch (err) {
    banner(err.message);
  }
}

function userRow(u) {
  const actions = h('td', { class: 'actions' });
  if (can('user:update')) actions.append(h('button', { onclick: () => openUserDialog(u) }, 'Edit'));
  if (can('user:reset_password')) actions.append(h('button', { onclick: () => openPasswordDialog(u) }, 'Reset password'));
  if (can('user:delete') && u.id !== state.me.id) {
    actions.append(h('button', { class: 'danger', onclick: () => removeUser(u) }, 'Delete'));
  }
  return h('tr', {},
    h('td', {}, u.username),
    h('td', {}, u.email),
    h('td', {}, [u.firstName, u.lastName].filter(Boolean).join(' ') || '—'),
    h('td', {}, ...u.roles.map((r) => h('span', { class: 'pill' }, r))),
    h('td', {}, h('span', { class: `pill ${u.status}` }, u.status)),
    h('td', {}, fmtDate(u.lastLoginAt)),
    actions);
}

async function removeUser(u) {
  if (!confirm(`Delete user "${u.username}"? This cannot be undone from the UI.`)) return;
  try {
    await api('DELETE', `/users/${u.id}`);
    banner(`Deleted ${u.username}`);
    await loadUsers();
  } catch (err) { banner(err.message); }
}

let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.users.page = 1; loadUsers(); }, 300);
});
for (const id of ['filter-role', 'filter-status']) {
  $(id).addEventListener('change', () => { state.users.page = 1; loadUsers(); });
}
$('prev-page').addEventListener('click', () => { state.users.page--; loadUsers(); });
$('next-page').addEventListener('click', () => { state.users.page++; loadUsers(); });
for (const th of document.querySelectorAll('th[data-sort]')) {
  th.addEventListener('click', () => {
    const u = state.users;
    u.order = u.sort === th.dataset.sort && u.order === 'asc' ? 'desc' : 'asc';
    u.sort = th.dataset.sort;
    loadUsers();
  });
}

// ---------- create / edit dialog ----------
let editing = null;

function openUserDialog(user = null) {
  editing = user;
  const form = $('user-form');
  form.reset();
  $('user-error').textContent = '';
  $('user-dialog-title').textContent = user ? `Edit ${user.username}` : 'New user';
  form.username.disabled = !!user; // username is immutable
  $('password-row').hidden = !!user;
  form.password.required = !user;
  form.username.value = user?.username ?? '';
  form.email.value = user?.email ?? '';
  form.firstName.value = user?.firstName ?? '';
  form.lastName.value = user?.lastName ?? '';
  form.phone.value = user?.phone ?? '';
  form.status.value = user?.status ?? 'active';

  const canAssign = can('user:assign_role');
  $('roles-row').hidden = !canAssign;
  $('roles-box').replaceChildren(...state.roles.map((r) => h('label', {},
    h('input', { type: 'checkbox', name: 'role', value: r.name, checked: user ? user.roles.includes(r.name) : r.name === 'user' }),
    ` ${r.name}`)));
  $('user-dialog').showModal();
}

$('new-user-btn').addEventListener('click', () => openUserDialog());
$('user-cancel').addEventListener('click', () => $('user-dialog').close());

$('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const text = (v) => v.trim() || null;
  const body = {
    email: f.email.value,
    firstName: text(f.firstName.value),
    lastName: text(f.lastName.value),
    phone: text(f.phone.value),
    status: f.status.value,
  };
  if (can('user:assign_role')) {
    body.roles = [...f.querySelectorAll('input[name=role]:checked')].map((c) => c.value);
    if (!body.roles.length) { $('user-error').textContent = 'Select at least one role'; return; }
  }
  try {
    if (editing) {
      await api('PATCH', `/users/${editing.id}`, { body });
    } else {
      await api('POST', '/users', { body: { ...body, username: f.username.value, password: f.password.value } });
    }
    $('user-dialog').close();
    banner(editing ? 'User updated' : 'User created');
    await loadUsers();
  } catch (err) { showError($('user-error'), err); }
});

// ---------- password dialogs (reset someone else's / change own) ----------
let pwTarget = null; // null => change own password

function openPasswordDialog(user = null) {
  pwTarget = user;
  const f = $('pw-form');
  f.reset();
  $('pw-error').textContent = '';
  $('pw-dialog-title').textContent = user ? `Reset password for ${user.username}` : 'Change your password';
  $('current-pw-row').hidden = !!user;
  f.currentPassword.required = !user;
  $('pw-dialog').showModal();
}
$('change-pw-btn').addEventListener('click', () => openPasswordDialog());
$('pw-cancel').addEventListener('click', () => $('pw-dialog').close());

$('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    if (pwTarget) {
      await api('POST', `/users/${pwTarget.id}/reset-password`, { body: { newPassword: f.newPassword.value } });
      banner(`Password reset for ${pwTarget.username}`);
      $('pw-dialog').close();
    } else {
      await api('POST', '/auth/change-password', {
        body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value },
      });
      $('pw-dialog').close();
      showLogin(); // every token was invalidated server-side
      $('login-error').textContent = 'Password changed. Please sign in again.';
    }
  } catch (err) { showError($('pw-error'), err); }
});

// ---------- audit log ----------
async function loadAudit() {
  try {
    const { data, meta } = await api('GET', '/audit-logs', {
      query: { page: state.audit.page, limit: 15, action: $('audit-action').value.trim().toUpperCase() },
    });
    $('audit-body').replaceChildren(...data.map((a) => h('tr', {},
      h('td', {}, fmtDate(a.createdAt)),
      h('td', {}, a.action),
      h('td', {}, a.actor?.username ?? '—'),
      h('td', {}, `${a.entityType}${a.entityId ? `:${a.entityId.slice(0, 8)}` : ''}`),
      h('td', {}, a.ipAddress ?? ''),
      h('td', {}, h('code', {}, JSON.stringify(a.details))))));
    $('audit-page-info').textContent = `Page ${meta.page} of ${meta.totalPages} (${meta.total} events)`;
    $('audit-prev').disabled = meta.page <= 1;
    $('audit-next').disabled = meta.page >= meta.totalPages;
  } catch (err) { banner(err.message); }
}
$('audit-refresh').addEventListener('click', () => { state.audit.page = 1; loadAudit(); });
$('audit-prev').addEventListener('click', () => { state.audit.page--; loadAudit(); });
$('audit-next').addEventListener('click', () => { state.audit.page++; loadAudit(); });

// ---------- boot ----------
if (getToken()) enterApp().catch(showLogin);
else showLogin();
