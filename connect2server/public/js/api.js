// Thin fetch wrapper. The JWT lives in sessionStorage: it is cleared when the tab closes and,
// unlike a cookie, is not sent automatically (no CSRF). XSS is the trade-off, so the UI never
// uses innerHTML with server data and the server sends a strict CSP.
const KEY = 'um.token';
const BASE = '/api/v1';

export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(method, path, { body, query } = {}) {
  const url = new URL(BASE + path, location.origin);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== '' && v != null) url.searchParams.set(k, v);

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return null;

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = payload.error ?? {};
    if (res.status === 401 && token && e.code !== 'INVALID_CREDENTIALS') onUnauthorized();
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Request failed (${res.status})`, e.details);
  }
  return payload;
}
