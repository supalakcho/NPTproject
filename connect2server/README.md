# User Management

Node.js (Express 5) + MySQL/MariaDB (XAMPP) user management with a browser UI and a REST API: bcrypt password hashing, JWT auth, role/permission-based access control, audit log.

## Quick start (XAMPP)

1. Start **MySQL** in the XAMPP Control Panel (default port **3306**, user `root`, empty password).
2. Then:
```bash
npm install
cp .env.example .env     # set JWT_SECRET (>= 32 chars) and ADMIN_EMAIL / ADMIN_PASSWORD; DB_* default to XAMPP
npm run db:init          # creates database `usermgmt`, applies schema + reference data
npm run seed:admin       # first admin from ADMIN_* env vars
npm start                # http://localhost:3000
```
Browse the data at http://localhost:8080/phpmyadmin (the XAMPP Apache port may differ).

Tests: `npm test` (37 tests; needs MySQL running — it drops and recreates the throwaway database `usermgmt_test`, never `usermgmt`). Postman: `postman/user-management.postman_collection.json` (run against a server that has an admin; set `baseUrl`, `adminUser`, `adminPassword`).

## Project structure

```
user-management/
├── api.md                      REST API reference (endpoints, errors, auth)
├── db/
│   ├── schema.sql              tables, constraints, indexes (3NF; MariaDB 10.4+)
│   └── seed.sql                statuses, roles, permissions, role→permission map
├── src/
│   ├── server.js               listen + graceful shutdown
│   ├── app.js                  middleware stack, routes, static UI
│   ├── config.js               env parsing and fail-fast checks
│   ├── db.js                   pool + transaction helper (swappable adapter)
│   ├── schemas.js              zod request schemas and password policy
│   ├── middleware/             auth (JWT + RBAC), validate, errorHandler
│   ├── routes/                 auth, users, meta (roles, audit-logs): thin HTTP layer
│   ├── services/               authService, userService: business rules + SQL
│   └── utils/                  errors, password (bcrypt), audit
├── public/                     frontend (vanilla JS modules, no build step)
│   ├── index.html, css/style.css
│   └── js/api.js, js/app.js
├── scripts/                    init-db, seed-admin, gen-postman
├── tests/                      api.test.js, helpers.js
├── postman/                    Postman collection
└── docs/                       er-diagram, data-dictionary, test-cases,
                                security-checklist, deployment-guide
```

## Documentation
- [API reference](api.md)
- [ER diagram](docs/er-diagram.md) · [Data dictionary](docs/data-dictionary.md)
- [Test cases](docs/test-cases.md) · [Security checklist](docs/security-checklist.md) · [Deployment guide](docs/deployment-guide.md)

## Design decisions worth knowing
- **Permissions come from the DB per request**, not from the JWT, so role changes and deactivation apply immediately. Cost: two small queries per request.
- **`token_version`** on `users` invalidates all of a user's tokens on password change/reset/deactivation/delete; `revoked_tokens` handles single-token logout.
- **Soft delete** keeps audit history intact; unique indexes cover live rows only (generated columns) so a deleted username/email can be reused.
- **Audit rows share the transaction** of the change they describe.
- **Update is `PATCH`** (partial); `username` is immutable.
- **DB access goes through `src/db.js`** with a swappable adapter, which is where `?` placeholders and the `{ rows }` result shape are defined.
