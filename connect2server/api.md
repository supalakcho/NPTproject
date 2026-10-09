# User Management REST API

Base URL: `/api/v1` · Format: JSON (`Content-Type: application/json`) · Version 1.0.0

## Conventions

**Authentication.** Every endpoint except `POST /auth/login` requires a JWT:

```
Authorization: Bearer <accessToken>
```

(`GET /health` is an unauthenticated liveness probe for load balancers; it returns only `{"status":"ok"}`.)

The token is HS256-signed, expires after `JWT_EXPIRES_IN` (default 1 h), and carries `sub` (user id), `jti`, `iss`, `ver`. Roles and permissions are **not** in the token; they are loaded from the database on each request, so role changes, deactivation and password changes take effect immediately. A token stops working when the user logs out, is deactivated or deleted, or their password changes or is reset.

**Success envelope.** `{ "data": ... }`, plus `"meta"` on lists. `204` responses have no body.

**Error envelope.**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [ { "in": "body", "field": "password", "message": "..." } ] } }
```

`details` appears only on `VALIDATION_ERROR`. Clients should branch on `code`, not `message`.

**Pagination** (list endpoints): `?page=1&limit=20` (`limit` max 100). Response `meta`:
`{ "page", "limit", "total", "totalPages" }`.

**Unknown fields** in request bodies are rejected (`400`), so clients cannot set fields such as `status` or `roles` where they are not allowed.

## RBAC

| Role | Permissions |
|---|---|
| `admin` | all |
| `manager` | `user:read`, `user:create`, `role:read` |
| `user` | none (own account only: `/auth/*`) |

Permissions: `user:read`, `user:create`, `user:update`, `user:delete`, `user:reset_password`, `user:assign_role`, `role:read`, `audit:read`. Creating a user with an explicit `roles` field, or changing roles, needs `user:assign_role`; without it, new users get the `user` role.

---

## Authentication

### POST /auth/login
Public. Rate limited per IP (`429 RATE_LIMITED`). Five failed attempts (configurable) lock the account for 15 minutes.

Request
```json
{ "username": "admin", "password": "Admin!Passw0rd" }
```
Username is case-insensitive.

Response `200`
```json
{ "data": {
    "accessToken": "eyJhbGciOi...", "tokenType": "Bearer", "expiresIn": 3600,
    "user": { "id": "0b1c...", "username": "admin", "email": "admin@example.com",
              "firstName": "System", "lastName": "Administrator", "phone": null,
              "status": "active", "roles": ["admin"],
              "lastLoginAt": "2026-10-09T08:00:00.000Z",
              "createdAt": "...", "updatedAt": "..." } } }
```
Errors: `400 VALIDATION_ERROR` · `401 INVALID_CREDENTIALS` (same body for wrong password and unknown user) · `403 ACCOUNT_INACTIVE` · `423 ACCOUNT_LOCKED` · `429 RATE_LIMITED`.

### POST /auth/logout
Revokes the current token. `204`. Errors: `401`.

### GET /auth/me
Current user plus `permissions: string[]`. `200`.

### POST /auth/change-password
```json
{ "currentPassword": "...", "newPassword": "Br4nd!NewPassw0rd" }
```
`204`; all existing tokens (including this one) become invalid, so log in again. Errors: `400 VALIDATION_ERROR` (policy), `400 CURRENT_PASSWORD_INCORRECT`, `401`.

**Password policy:** 10 characters minimum, at most 72 bytes (bcrypt limit), with upper-case, lower-case, digit and symbol.

---

## Users

### GET /users — `user:read`
Query parameters (all optional):

| Param | Description |
|---|---|
| `page`, `limit` | pagination (default 1 / 20, max 100) |
| `search` | case-insensitive substring of username, email, or full name |
| `role` | role name, e.g. `admin` |
| `status` | `active` \| `inactive` |
| `sort` | `username` \| `email` \| `createdAt` (default) \| `lastLoginAt` |
| `order` | `asc` \| `desc` (default) |

Response `200`: `{ "data": [User, ...], "meta": {...} }`. Errors: `400`, `401`, `403`.

### POST /users — `user:create`
```json
{ "username": "somchai", "email": "somchai@example.com", "password": "Str0ng!Passw0rd",
  "firstName": "Somchai", "lastName": "Jaidee", "phone": "+66 81-234-5678",
  "status": "active", "roles": ["manager"] }
```
Required: `username` (3–50 of `a-z 0-9 . _ -`, stored lower-case), `email` (stored lower-case), `password`. Optional: the rest (`roles` needs `user:assign_role`; default `["user"]`).

Response `201` with `Location: /api/v1/users/{id}` and `{ "data": User }`.
Errors: `400 VALIDATION_ERROR` · `400 INVALID_ROLE` · `403 FORBIDDEN` · `409 USERNAME_TAKEN` · `409 EMAIL_TAKEN`.
Uniqueness is case-insensitive and ignores soft-deleted users.

### GET /users/{id} — `user:read`
`200 { "data": User }` · `400` (id not a UUID) · `404 USER_NOT_FOUND`.

### PATCH /users/{id} — `user:update`
Partial update; at least one of `email`, `firstName`, `lastName`, `phone`, `status`, `roles`. `username` cannot be changed. Send `null` to clear a profile field.

Response `200 { "data": User }` (unchanged request returns the current user without writing an audit event).
Errors: `400 VALIDATION_ERROR` · `400 INVALID_ROLE` · `403 FORBIDDEN` (changing roles without `user:assign_role`) · `404` · `409 EMAIL_TAKEN` · `409 SELF_LOCKOUT` (deactivating yourself / removing your own admin role) · `409 LAST_ADMIN`.
Deactivating a user invalidates their tokens.

### DELETE /users/{id} — `user:delete`
Soft delete. `204`. Errors: `404` · `409 SELF_DELETE` · `409 LAST_ADMIN`.

### POST /users/{id}/reset-password — `user:reset_password`
```json
{ "newPassword": "Br4nd!NewPassw0rd" }
```
`204`. Clears any lockout and invalidates the user's tokens. Errors: `400`, `404`.

---

## Roles

### GET /roles — `role:read`
`200 { "data": [ { "name": "admin", "description": "...", "permissions": ["user:read", ...] } ] }`

## Audit logs

### GET /audit-logs — `audit:read`
Filters: `action`, `entityType`, `entityId`, `actorId` (UUID), `from`, `to` (ISO 8601), `page`, `limit`. Newest first.

```json
{ "data": [ { "id": "42", "action": "USER_UPDATED", "entityType": "user", "entityId": "0b1c...",
              "details": { "changes": { "status": { "from": "active", "to": "inactive" } } },
              "ipAddress": "10.0.0.5", "userAgent": "...", "createdAt": "...",
              "actor": { "id": "...", "username": "admin" } } ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }
```

Recorded actions: `LOGIN_SUCCESS`, `LOGIN_FAILED` (details: attempted username and reason), `LOGOUT`, `USER_CREATED`, `USER_UPDATED` (field-level before/after), `USER_DELETED`, `PASSWORD_CHANGED`, `PASSWORD_CHANGE_FAILED`, `PASSWORD_RESET`, `ACCESS_DENIED` (details: method, path, missing permissions). Passwords and hashes are never logged.

---

## Error codes

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body, query or path failed validation; see `details` |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 400 | `INVALID_ROLE` | Unknown role name |
| 400 | `CURRENT_PASSWORD_INCORRECT` | Wrong `currentPassword` |
| 401 | `TOKEN_MISSING` | No `Authorization: Bearer` header |
| 401 | `TOKEN_INVALID` | Bad signature/format/issuer, user gone or inactive, or token superseded by a password change |
| 401 | `TOKEN_EXPIRED` | Token past `exp` |
| 401 | `TOKEN_REVOKED` | Token was logged out |
| 401 | `INVALID_CREDENTIALS` | Wrong username or password |
| 403 | `FORBIDDEN` | Authenticated but lacks the permission |
| 403 | `ACCOUNT_INACTIVE` | Correct credentials, account disabled |
| 404 | `USER_NOT_FOUND` | No such (non-deleted) user |
| 404 | `ROUTE_NOT_FOUND` | No such endpoint |
| 409 | `USERNAME_TAKEN` / `EMAIL_TAKEN` | Duplicate |
| 409 | `SELF_DELETE` / `SELF_LOCKOUT` | Would lock the caller out |
| 409 | `LAST_ADMIN` | Would leave no active admin |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 KB |
| 423 | `ACCOUNT_LOCKED` | Too many failed logins; retry after the lock window |
| 429 | `RATE_LIMITED` | Login rate limit hit |
| 500 | `INTERNAL_ERROR` | Unexpected; details are in server logs only |

## Example

```bash
TOKEN=$(curl -s localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin!Passw0rd"}' | jq -r .data.accessToken)
curl -s "localhost:3000/api/v1/users?search=som&status=active&limit=10" -H "Authorization: Bearer $TOKEN"
```
