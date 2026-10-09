# Data Dictionary

PostgreSQL 14+. Source of truth: [`db/schema.sql`](../db/schema.sql).

## user_statuses — lookup of account states
| Column | Type | Null | Key / Default | Description |
|---|---|---|---|---|
| id | SMALLINT | N | PK | 1 = active, 2 = inactive |
| code | VARCHAR(20) | N | UNIQUE | Machine name used by the API |
| description | VARCHAR(100) | N | | Human text |

## users — one row per account
| Column | Type | Null | Key / Default | Description |
|---|---|---|---|---|
| id | UUID | N | PK, `gen_random_uuid()` | Public identifier (not guessable/sequential) |
| username | VARCHAR(50) | N | unique among live rows | Lower-case; `^[a-z0-9._-]{3,50}$` (CHECK) |
| email | VARCHAR(255) | N | unique among live rows | Lower-case (CHECK) |
| password_hash | VARCHAR(100) | N | CHECK `^\$2[aby]\$NN\$` | **bcrypt hash only**; the DB rejects anything that is not bcrypt-shaped |
| status_id | SMALLINT | N | FK → user_statuses, default 1 | |
| token_version | INTEGER | N | default 0 | Embedded in the JWT as `ver`; incremented on password change/reset, deactivation, delete → old tokens die |
| failed_login_count | SMALLINT | N | default 0 | Consecutive failures; reset on success or lock |
| locked_until | TIMESTAMPTZ | Y | | Login refused until then |
| last_login_at | TIMESTAMPTZ | Y | | |
| password_changed_at | TIMESTAMPTZ | N | default now() | |
| created_at / updated_at | TIMESTAMPTZ | N | default now() | `updated_at` maintained by trigger |
| created_by / updated_by | UUID | Y | FK → users, ON DELETE SET NULL | Who did it |
| deleted_at | TIMESTAMPTZ | Y | | Soft delete marker |

Indexes: `ux_users_username`, `ux_users_email` (partial, `WHERE deleted_at IS NULL`), `ix_users_status`, `ix_users_created_at`.

## user_profiles — optional personal data (1:1)
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| user_id | UUID | N | PK, FK → users ON DELETE CASCADE | |
| first_name, last_name | VARCHAR(100) | Y | | |
| phone | VARCHAR(30) | Y | | Digits, `+ - ( )` and spaces |

## roles
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| id | SMALLINT identity | N | PK | |
| name | VARCHAR(50) | N | UNIQUE | `admin`, `manager`, `user` |
| description | VARCHAR(255) | N | default '' | |

## permissions
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| id | SMALLINT identity | N | PK | |
| code | VARCHAR(50) | N | UNIQUE | `resource:action`, e.g. `user:read` |
| description | VARCHAR(255) | N | default '' | |

## user_roles — users ⇄ roles
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| user_id | UUID | N | PK, FK → users CASCADE | |
| role_id | SMALLINT | N | PK, FK → roles RESTRICT | A role in use cannot be deleted |
| assigned_at | TIMESTAMPTZ | N | default now() | |

## role_permissions — roles ⇄ permissions
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| role_id | SMALLINT | N | PK, FK → roles CASCADE | |
| permission_id | SMALLINT | N | PK, FK → permissions CASCADE | |

## revoked_tokens — logged-out JWTs
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| jti | UUID | N | PK | JWT ID |
| user_id | UUID | N | FK → users CASCADE | |
| expires_at | TIMESTAMPTZ | N | indexed | Row is purged on later logouts once expired |
| revoked_at | TIMESTAMPTZ | N | default now() | |

## audit_logs — append-only change history
| Column | Type | Null | Key | Description |
|---|---|---|---|---|
| id | BIGINT identity | N | PK | |
| actor_user_id | UUID | Y | FK → users SET NULL | NULL for anonymous events (failed login for unknown user) |
| action | VARCHAR(50) | N | indexed | See `api.md` for the list |
| entity_type | VARCHAR(50) | N | indexed with entity_id | `user`, `auth` |
| entity_id | VARCHAR(64) | Y | | Id of the affected entity |
| details | JSONB | N | default `{}` | Field-level changes / reason; never secrets |
| ip_address | VARCHAR(45) | Y | | |
| user_agent | VARCHAR(255) | Y | | |
| created_at | TIMESTAMPTZ | N | default now(), indexed | |

Production hardening: grant the app role `INSERT, SELECT` only on `audit_logs` (no `UPDATE/DELETE`) to make it tamper-resistant from the application.
