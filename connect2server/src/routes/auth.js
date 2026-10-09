import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { changePasswordBody, loginBody } from '../schemas.js';
import * as authService from '../services/authService.js';
import { getUser } from '../services/userService.js';
import { requestContext } from '../utils/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } }),
});

router.post('/login', loginLimiter, validate({ body: loginBody }), async (req, res) => {
  const { username, password } = req.valid.body;
  res.json({ data: await authService.login(username, password, requestContext(req)) });
});

router.post('/logout', authenticate, async (req, res) => {
  await authService.logout(req.auth, requestContext(req));
  res.status(204).end();
});

router.get('/me', authenticate, async (req, res) => {
  const user = await getUser(req.auth.user.id);
  res.json({ data: { ...user, permissions: req.auth.user.permissions } });
});

router.post('/change-password', authenticate, validate({ body: changePasswordBody }), async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  await authService.changeOwnPassword(req.auth, currentPassword, newPassword, requestContext(req));
  res.status(204).end();
});

export default router;
