import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createUserBody, idParam, listUsersQuery, resetPasswordBody, updateUserBody,
} from '../schemas.js';
import * as users from '../services/userService.js';
import { requestContext } from '../utils/audit.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('user:read'), validate({ query: listUsersQuery }), async (req, res) => {
  const { items, meta } = await users.listUsers(req.valid.query);
  res.json({ data: items, meta });
});

router.post('/', authorize('user:create'), validate({ body: createUserBody }), async (req, res) => {
  const user = await users.createUser(req.auth.user, req.valid.body, requestContext(req));
  res.status(201).location(`/api/v1/users/${user.id}`).json({ data: user });
});

router.get('/:id', authorize('user:read'), validate({ params: idParam }), async (req, res) => {
  res.json({ data: await users.getUser(req.valid.params.id) });
});

router.patch('/:id', authorize('user:update'), validate({ params: idParam, body: updateUserBody }), async (req, res) => {
  const user = await users.updateUser(req.auth.user, req.valid.params.id, req.valid.body, requestContext(req));
  res.json({ data: user });
});

router.delete('/:id', authorize('user:delete'), validate({ params: idParam }), async (req, res) => {
  await users.deleteUser(req.auth.user, req.valid.params.id, requestContext(req));
  res.status(204).end();
});

router.post('/:id/reset-password', authorize('user:reset_password'),
  validate({ params: idParam, body: resetPasswordBody }), async (req, res) => {
    await users.resetPassword(req.auth.user, req.valid.params.id, req.valid.body.newPassword, requestContext(req));
    res.status(204).end();
  });

export default router;
