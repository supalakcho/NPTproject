# ER Diagram

Renders in GitHub, GitLab, VS Code (Mermaid extension) and <https://mermaid.live>.

```mermaid
erDiagram
    user_statuses ||--o{ users : "status_id"
    users ||--o| user_profiles : "1:1 profile"
    users ||--o{ user_roles : "has"
    roles ||--o{ user_roles : "assigned"
    roles ||--o{ role_permissions : "grants"
    permissions ||--o{ role_permissions : "granted by"
    users ||--o{ revoked_tokens : "logged out"
    users |o--o{ audit_logs : "actor"
    users |o--o{ users : "created_by / updated_by"

    user_statuses {
        smallint id PK
        varchar code UK
        varchar description
    }
    users {
        uuid id PK
        varchar username UK "live rows only"
        varchar email UK "live rows only"
        varchar password_hash "bcrypt"
        smallint status_id FK
        int token_version
        smallint failed_login_count
        timestamptz locked_until
        timestamptz last_login_at
        timestamptz password_changed_at
        timestamptz created_at
        timestamptz updated_at
        uuid created_by FK
        uuid updated_by FK
        timestamptz deleted_at "soft delete"
    }
    user_profiles {
        uuid user_id PK, FK
        varchar first_name
        varchar last_name
        varchar phone
    }
    roles {
        smallint id PK
        varchar name UK
        varchar description
    }
    permissions {
        smallint id PK
        varchar code UK
        varchar description
    }
    user_roles {
        uuid user_id PK, FK
        smallint role_id PK, FK
        timestamptz assigned_at
    }
    role_permissions {
        smallint role_id PK, FK
        smallint permission_id PK, FK
    }
    revoked_tokens {
        uuid jti PK
        uuid user_id FK
        timestamptz expires_at
        timestamptz revoked_at
    }
    audit_logs {
        bigint id PK
        uuid actor_user_id FK
        varchar action
        varchar entity_type
        varchar entity_id
        jsonb details
        varchar ip_address
        varchar user_agent
        timestamptz created_at
    }
```

## Normalization (3NF) notes

- **1NF:** every column is atomic. Roles are rows in `user_roles`, not a list in `users`.
- **2NF:** the many-to-many tables (`user_roles`, `role_permissions`) have composite keys and no non-key columns that depend on only part of the key (`assigned_at` depends on the pair).
- **3NF:** no non-key column depends on another non-key column. Status text lives in `user_statuses`, role text in `roles`, permission text in `permissions`; profile attributes sit in `user_profiles`, keyed by the user.
- **Deliberate, documented exceptions to pure normalization:**
  - `audit_logs.entity_id` is a plain string with no FK, because audit rows must outlive and describe any entity type, including deleted ones.
  - `audit_logs.details` is JSONB: an immutable event snapshot, never joined or updated.
  - `users.failed_login_count`, `locked_until`, `token_version` depend only on the user, so they stay in `users`.

## Extending

New permission: insert into `permissions` and `role_permissions`; no code change for data, add the code to a route's `authorize(...)`. New role: insert into `roles`. New user attribute: add to `user_profiles`. New audited entity: write `audit_logs` rows with a new `entity_type`.
