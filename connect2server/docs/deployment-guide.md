# Deployment Guide

## 1. Prerequisites
- Node.js 20+ (developed on 24), PostgreSQL 14+ (needs `gen_random_uuid()`), a reverse proxy/load balancer with TLS.
- `bcrypt` is a native module: use a Node image/OS with prebuilt binaries or a C++ toolchain.

## 2. Database
```bash
psql -U postgres -f db/00_create_database.sql        # edit the password first
export DATABASE_URL=postgres://usermgmt_app:<password>@db-host:5432/usermgmt
npm run db:init                                        # schema.sql + seed.sql (idempotent)
```
Schema changes after go-live: add numbered migration files (e.g. with node-pg-migrate or Flyway) rather than editing `schema.sql`.

## 3. Configuration (environment, see `.env.example`)
| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 48+ random bytes from a secret manager |
| `DATABASE_URL`, `DB_SSL` | real DB, `true` if remote |
| `BCRYPT_ROUNDS` | `12` or higher (checked at startup) |
| `TRUST_PROXY` | `true` behind the load balancer |
| `CORS_ORIGINS` | only if the UI is on another origin |

## 4. First admin
```bash
ADMIN_USERNAME=admin ADMIN_EMAIL=it@company.example ADMIN_PASSWORD='<strong one-time password>' npm run seed:admin
```
Log in, change the password immediately, then remove `ADMIN_PASSWORD` from the environment/shell history.

## 5. Run
```bash
npm ci --omit=dev
npm start            # or under systemd / PM2 / a container
```
Example `Dockerfile`:
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
```
The server handles `SIGTERM` gracefully (drains requests, closes the pool). Point the load balancer health check at `GET /health`.

## 6. Deployment checklist
- [ ] TLS enabled; HTTP redirects to HTTPS; HSTS set at the proxy
- [ ] `JWT_SECRET` is unique per environment and not in git
- [ ] DB role is not a superuser; `audit_logs` is insert/select only
- [ ] `npm run db:init` succeeded; tables and seed rows present
- [ ] First admin created, default/one-time password changed
- [ ] `NODE_ENV=production`, `TRUST_PROXY` correct (check that audit `ip_address` is the client IP, not the proxy)
- [ ] `npm test` green on the build being deployed; `npm audit` reviewed
- [ ] Log shipping and alerting on 5xx and on bursts of `LOGIN_FAILED` / `ACCESS_DENIED`
- [ ] Database backups scheduled and a restore tested
- [ ] Rate limiting verified (21st bad login → 429); with multiple instances, shared store or gateway limit
- [ ] Postman collection run against the deployed URL
- [ ] Rollback plan: previous image/tag kept; migrations are backward compatible

## 7. Scaling notes
The API is stateless (JWT + DB checks), so run N instances behind a load balancer. The DB pool is `DB_POOL_MAX` per instance; keep `instances × pool ≤ Postgres max_connections`. Each request does 2 small queries for auth; add a short-TTL cache or move to signed permission claims only if profiling shows it matters.
