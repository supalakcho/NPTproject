// export รวมทุก service · ทุกฟังก์ชันถูกห่อให้ error ทุกชนิดออกมาเป็น AppError (DbError แปลงตามชื่อ constraint)
// import { loans, reservations } from '../services/index.js';
import { toAppError } from './core/dbErrorMapper.js';
import * as authService from './auth.service.js';
import * as profileService from './profile.service.js';
import * as brandsService from './brands.service.js';
import * as notebookModelsService from './notebookModels.service.js';
import * as notebooksService from './notebooks.service.js';
import * as reservationsService from './reservations.service.js';
import * as loansService from './loans.service.js';
import * as notificationsService from './notifications.service.js';
import * as usersService from './users.service.js';
import * as settingsService from './settings.service.js';
import * as auditLogsService from './auditLogs.service.js';
import * as reportsService from './reports.service.js';

function wrap(mod) {
  const out = {};
  for (const [name, fn] of Object.entries(mod)) {
    out[name] = async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        throw toAppError(err);
      }
    };
  }
  return Object.freeze(out);
}

export const auth = wrap(authService);
export const profile = wrap(profileService);
export const brands = wrap(brandsService);
export const notebookModels = wrap(notebookModelsService);
export const notebooks = wrap(notebooksService);
export const reservations = wrap(reservationsService);
export const loans = wrap(loansService);
export const notifications = wrap(notificationsService);
export const users = wrap(usersService);
export const settings = wrap(settingsService);
export const auditLogs = wrap(auditLogsService);
export const reports = wrap(reportsService);

export { AppError } from './core/AppError.js';
export { anonymousCtx } from './core/context.js';
