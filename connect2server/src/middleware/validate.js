import { badRequest } from '../utils/errors.js';

// validate({ params, query, body }) parses each part with a zod schema and
// exposes the cleaned result as req.valid.{params,query,body}. Handlers must
// read req.valid, never the raw req.body, so unknown fields cannot leak in.
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  const details = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(part === 'body' ? (req.body ?? {}) : req[part]);
    if (result.success) {
      req.valid[part] = result.data;
    } else {
      for (const issue of result.error.issues) {
        details.push({ in: part, field: issue.path.join('.'), message: issue.message });
      }
    }
  }
  if (details.length) throw badRequest('VALIDATION_ERROR', 'Request validation failed', details);
  next();
};
