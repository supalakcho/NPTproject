// export รวมทุก model ให้ service import จากที่เดียว
// import { withTransaction, users, loans, DbError } from '../models/index.js';
export { query, execute, withTransaction } from './core/db.js';
export { DbError } from './core/DbError.js';
export { closePool } from '../config/database.js';

export * as roles from './roles.model.js';
export * as permissions from './permissions.model.js';
export * as rolePermissions from './rolePermissions.model.js';
export * as users from './users.model.js';
export * as brands from './brands.model.js';
export * as notebookModels from './notebookModels.model.js';
export * as notebooks from './notebooks.model.js';
export * as reservations from './reservations.model.js';
export * as loans from './loans.model.js';
export * as notifications from './notifications.model.js';
export * as settings from './settings.model.js';
export * as auditLogs from './auditLogs.model.js';
export * as reports from './reports.model.js';
