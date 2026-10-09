# API Test Cases

Automated: `npm test` runs [`tests/api.test.js`](../tests/api.test.js) (37 tests) against a real Postgres engine (PGlite, in-process) with the real schema and seed. Manual: import [`postman/user-management.postman_collection.json`](../postman/user-management.postman_collection.json); set the `baseUrl`, `adminUser`, `adminPassword` variables and run the collection in order.

| # | Verification item | Test case | Expected | Automated test |
|---|---|---|---|---|
| 1 | Normalization / FKs | All relationship FKs exist; `users` carries no role/status/profile text | FKs present, columns absent | `V1 database…` |
| 1 | FK integrity | Insert `user_roles` for a non-existent user | rejected (FK) | `rejects an orphan…` |
| 2 | No plain-text password | Create user, read `password_hash` from DB | `$2b$..`, ≠ password, `bcrypt.compare` true | `V2 stores only a bcrypt hash` |
| 2 | DB guard | Insert `password_hash = 'plain-text'` | CHECK violation | `rejects a user row…` |
| 2 | Logs clean | Search audit `details` for the password | no rows | same + `failed logins record…` |
| 3 | Login success | Valid credentials (any case username) | 200, Bearer JWT, no hash in body | `succeeds with correct…` |
| 3 | Login failure | Wrong password / unknown user | 401 `INVALID_CREDENTIALS`, identical bodies | `fails with 401…` |
| 3 | Bad input | Missing field; malformed JSON | 400 `VALIDATION_ERROR`; 400 `INVALID_JSON` | two tests |
| 3 | Lockout | 3 bad passwords (test config) then the right one | 423 `ACCOUNT_LOCKED` | `locks the account…` |
| 3 | Inactive | Correct password on inactive user | 403 `ACCOUNT_INACTIVE` | `blocks inactive…` |
| 4 | No token | Every protected route without header | 401 `TOKEN_MISSING` | `every route except login…` |
| 4 | Bad token | garbage, tampered, wrong secret, `alg:none`, expired | 401 `TOKEN_INVALID` / `TOKEN_EXPIRED` | `rejects garbage…` |
| 4 | RBAC | user → 403; manager read/create ok, update/delete/reset/audit 403; admin ok | per role | `enforces RBAC` |
| 4 | Escalation | Manager creates user with `roles:["admin"]` | 403, nothing created | `prevents privilege escalation` |
| 4 | Live permissions | Remove a role after token issued | next call 403 | `applies role changes immediately` |
| 4 | Logout | Use token after logout | 401 `TOKEN_REVOKED` | `logout revokes…` |
| 4 | Deactivation | Deactivate user holding a token | 401 | `deactivation invalidates…` |
| 5 | Create | POST valid user | 201, `Location`, default role `user`, lower-cased username | `POST creates` |
| 5 | Read | GET existing / unknown / malformed id | 200 / 404 / 400 | `GET one…` |
| 5 | Update | PATCH profile, email, status, roles; empty body; `username` | 200; 400; 400 | `PATCH updates…` |
| 5 | Reset password | Admin resets; new password logs in | 204 then 200 | `reset-password…` |
| 5 | List | page/limit, sort, search (incl. `%`), role, status, limit>100, bad sort | correct pages; `%` matches nothing; 400 for invalid | `GET list…` |
| 5 | Delete | DELETE, repeat, GET, reuse username | 204, 404, 404, 201 | `DELETE soft-deletes…` |
| 5 | Admin safety | Self-delete / self-demote / delete last admin | 409 `SELF_DELETE` / `SELF_LOCKOUT` / `LAST_ADMIN` | two tests |
| 5 | Own password | Wrong current; weak new; success | 400; 400; 204 and old token dead | `change-password…` |
| 6 | Duplicates | Same username (different case); same email (different case) | 409 `USERNAME_TAKEN` / `EMAIL_TAKEN`; no partial row | `rejects duplicate…` |
| 6 | Validation | weak/short password, bad username/email, unknown field, unknown role | 400 with per-field `details` | `validates the body…` |
| 7 | Audit coverage | Run all flows, list distinct actions | LOGIN_SUCCESS/FAILED, LOGOUT, USER_CREATED/UPDATED/DELETED, PASSWORD_RESET/CHANGED/CHANGE_FAILED, ACCESS_DENIED | `records every important activity` |
| 7 | Audit content | Latest USER_UPDATED | actor, entity id, `changes`, ip | `captures actor…` |
| 7 | Atomicity | Failed (409) create | no USER_CREATED row | `writes the audit row in the same transaction` |
| 8 | Status codes | 200, 201, 204, 400, 401, 403, 404, 409, 423 | asserted across the tests above | — |
| — | Security headers | GET /health | CSP present, no `X-Powered-By` | `sets security headers` |

## Not covered by automation (do manually before go-live)

- Run `npm run db:init` against the real PostgreSQL server (tests use PGlite, which is real Postgres code but not your server version/config).
- `429 RATE_LIMITED` (the test config raises the limit): send 21 bad logins from one IP.
- TLS, proxy headers (`TRUST_PROXY`), CORS for your actual origins.
- Load test list/search with realistic row counts.
