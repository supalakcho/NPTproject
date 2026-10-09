-- Reference data (idempotent). The first admin user is created by `npm run seed:admin`
-- because it needs a bcrypt hash generated at runtime.

INSERT IGNORE INTO user_statuses (id, code, description) VALUES
  (1, 'active',   'Can sign in'),
  (2, 'inactive', 'Disabled; cannot sign in');

INSERT IGNORE INTO roles (name, description) VALUES
  ('admin',   'Full access'),
  ('manager', 'Can view and create users'),
  ('user',    'Standard account; own profile only');

INSERT IGNORE INTO permissions (code, description) VALUES
  ('user:read',           'List and view users'),
  ('user:create',         'Create users'),
  ('user:update',         'Update users'),
  ('user:delete',         'Delete users'),
  ('user:reset_password', 'Reset another user''s password'),
  ('user:assign_role',    'Assign roles to users'),
  ('role:read',           'List roles'),
  ('audit:read',          'Read audit logs');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('user:read', 'user:create', 'role:read')
WHERE r.name = 'manager';
