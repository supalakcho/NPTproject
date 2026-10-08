// สร้าง req.ctx: requireAuth ตรวจ Bearer token, publicCtx สำหรับ endpoint ที่ไม่ต้อง login
import { auth, anonymousCtx } from '../services/index.js';

const requestInfo = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

export function publicCtx(req, res, next) {
  req.ctx = anonymousCtx(requestInfo(req));
  next();
}

export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  req.ctx = await auth.authenticate(scheme === 'Bearer' ? token : undefined, requestInfo(req));
  next();
}
