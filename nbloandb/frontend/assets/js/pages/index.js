// index.html: ตรวจ token (GET /me) แล้วพาไปหน้าแรกตาม role หรือหน้า login
import { appUrl } from '../config.js';
import { homePathFor } from '../core/auth.js';
import { requireLogin } from '../core/guard.js';

const session = await requireLogin();
location.replace(appUrl(homePathFor(session.user.roleCode)));
