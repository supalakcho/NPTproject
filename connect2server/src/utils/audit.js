import { query } from '../db.js';

export const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 255),
});

// `db` is either the global `query`-bearing module or a transaction client, so
// state changes and their audit rows commit (or roll back) together.
export async function writeAudit(db, { actorId = null, action, entityType, entityId = null, details = {}, ctx = {} }) {
  const run = db?.query ? (text, params) => db.query(text, params) : query;
  await run(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [actorId, action, entityType, entityId, JSON.stringify(details), ctx.ip ?? null, ctx.userAgent ?? null],
  );
}
