import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { publicCtx, requireAuth } from '../middlewares/authenticate.js';

const router = Router();
router.post('/register', publicCtx, c.register); // A1 Public
router.post('/login', publicCtx, c.login); // A2 Public
router.post('/logout', requireAuth, c.logout); // A3
export default router;
