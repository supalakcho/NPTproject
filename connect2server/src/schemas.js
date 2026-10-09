import { z } from 'zod';

const password = z.string()
  .min(10, 'Password must be at least 10 characters')
  .refine((v) => Buffer.byteLength(v) <= 72, 'Password must be at most 72 bytes (bcrypt limit)')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v),
    'Password must contain upper-case, lower-case, a digit and a symbol');

const username = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9._-]{3,50}$/, 'Username must be 3-50 chars: a-z, 0-9, ".", "_" or "-"');
const email = z.string().trim().toLowerCase().max(255).email('Invalid email address');
const name = z.string().trim().min(1).max(100).nullable();
const phone = z.string().trim().max(30).regex(/^[0-9+\-() ]*$/, 'Invalid phone number').nullable();
const status = z.enum(['active', 'inactive']);
const roleNames = z.array(z.string().trim().min(1).max(50)).min(1).max(10);
const id = z.string().uuid();

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const optionalText = z.string().trim().min(1).max(100).optional();

export const idParam = z.object({ id });

export const loginBody = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(1024), // not policy-checked: only the stored hash decides
}).strict();

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: password,
}).strict();

export const resetPasswordBody = z.object({ newPassword: password }).strict();

export const createUserBody = z.object({
  username,
  email,
  password,
  firstName: name.optional(),
  lastName: name.optional(),
  phone: phone.optional(),
  status: status.optional(),
  roles: roleNames.optional(),
}).strict();

export const updateUserBody = z.object({
  email: email.optional(),
  firstName: name.optional(),
  lastName: name.optional(),
  phone: phone.optional(),
  status: status.optional(),
  roles: roleNames.optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'At least one field is required');

export const listUsersQuery = z.object({
  page,
  limit,
  search: optionalText,
  role: optionalText,
  status: status.optional(),
  sort: z.enum(['username', 'email', 'createdAt', 'lastLoginAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const listAuditQuery = z.object({
  page,
  limit,
  action: z.string().trim().max(50).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(64).optional(),
  actorId: id.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
