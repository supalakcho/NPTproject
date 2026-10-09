# Security Checklist

Status: ✅ implemented and covered by a test or code path · 🔧 operator must do at deployment · ⚠️ known limitation / decision.

## Credentials and tokens
- ✅ Passwords stored only as bcrypt hashes (cost 12; app refuses to start in production below 12); DB CHECK rejects non-bcrypt values.
- ✅ Password policy: ≥10 chars, mixed case, digit, symbol, ≤72 bytes (bcrypt silently truncates beyond that).
- ✅ Hash and password never returned by the API or written to logs/audit.
- ✅ Login is constant-ish time for unknown users (dummy bcrypt compare) and returns one error for both cases.
- ✅ Account lockout (5 failures → 15 min) plus per-IP login rate limit.
- ✅ JWT: HS256 pinned (rejects `alg:none`), issuer checked, 1 h expiry, `jti`, secret ≥32 chars enforced at startup.
- ✅ Tokens revoked on logout; invalidated by password change/reset, deactivation, deletion (`token_version`).
- ✅ Permissions loaded from DB on each request (no stale privileges in tokens).
- 🔧 Generate `JWT_SECRET` with a CSPRNG, store in a secret manager, rotate on suspected leak (rotation logs everyone out).
- ⚠️ No refresh tokens: users re-login after expiry. Add a rotating refresh token if 1 h is too short.
- ⚠️ HS256 means every service that verifies tokens holds the signing secret. For many consuming systems, switch to RS256/ES256 and publish the public key.
- ⚠️ A locked-out account returns 423, which reveals that the username exists. Accepted trade-off for usability; switch to a generic 401 if enumeration matters more.

## Access control
- ✅ Every route except `/auth/login` (and `/health`) requires a valid JWT; tested.
- ✅ RBAC via permissions; role assignment requires its own permission (no escalation by managers); tested.
- ✅ Cannot delete/deactivate yourself or the last active admin.
- ✅ `ACCESS_DENIED` is audited.

## Input and output
- ✅ Schema validation (zod) on every body/query/param; unknown body fields rejected (no mass assignment).
- ✅ Parameterized SQL everywhere; sort columns come from a whitelist; `LIKE` wildcards escaped.
- ✅ Body size limit 10 KB; JSON-only.
- ✅ Frontend renders server data with `textContent` only (no `innerHTML`); verified with an HTML payload in a name field.
- ✅ `helmet` headers incl. CSP (no inline scripts), `X-Powered-By` removed.
- ✅ Internal errors return a generic 500; stack traces go to server logs only.

## Data and audit
- ✅ Unique username/email enforced by the database (partial unique indexes), not just app code.
- ✅ Audit rows are written in the same transaction as the change.
- 🔧 Restrict the DB role: `INSERT, SELECT` only on `audit_logs`; no superuser for the app.
- 🔧 Enable encrypted backups; define audit-log retention.
- ⚠️ Audit logs store IP and user agent (personal data under PDPA): set a retention period.

## Transport and platform
- 🔧 Terminate TLS (HTTPS only, HSTS at the proxy); set `TRUST_PROXY=true` only behind a proxy you control.
- 🔧 Set `CORS_ORIGINS` to exact origins (empty = same-origin only).
- 🔧 `DB_SSL=true` for managed/remote databases.
- 🔧 Run `npm audit` in CI; pin Node LTS; keep dependencies patched.
- 🔧 Run as a non-root user, read-only filesystem where possible.
- ⚠️ The SPA keeps the JWT in `sessionStorage` (no CSRF exposure, but readable by injected script). The CSP and `textContent` rendering mitigate XSS. For higher assurance use an HttpOnly, SameSite=Strict cookie plus CSRF protection.
- ⚠️ Rate limiting is in-memory per process; with several instances use a shared store (Redis) or enforce at the gateway.
