import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listAuditQuery } from '../schemas.js';
import { listAuditLogs, listRoles } from '../services/userService.js';

export const rolesRouter = Router();
rolesRouter.get('/', authenticate, authorize('role:read'), async (_req, res) => {
  res.json({ data: await listRoles() });
});

export const auditRouter = Router();
auditRouter.get('/', authenticate, authorize('audit:read'), validate({ query: listAuditQuery }), async (req, res) => {
  const { items, meta } = await listAuditLogs(req.valid.query);
  res.json({ data: items, meta });
});
