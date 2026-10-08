// ห่อฟังก์ชัน service เป็น Express handler และจัดรูป response ตาม http-api-spec ข้อ 1.1
// error ส่งต่อให้ errorHandler (Express 5 จับ promise ที่ reject ให้เอง)

/**
 * @param {(ctx: object, req: import('express').Request) => Promise<unknown>} call
 * @param {{ status?: number }} [opts] status ค่าเริ่มต้น 200
 * @returns {import('express').RequestHandler}
 * @example
 * export const create = handle((ctx, req) => brands.createBrand(ctx, req.body), { status: 201 });
 */
export function handle(call, { status = 200 } = {}) {
  return async (req, res) => {
    const result = await call(req.ctx, req);
    res.status(status).json(toBody(result));
  };
}

/** { rows, total, page, pageSize } → data + meta · อย่างอื่น → data */
export function toBody(result) {
  if (result && Array.isArray(result.rows) && typeof result.total === 'number') {
    const { rows, total, page, pageSize } = result;
    return { success: true, data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
  return { success: true, data: result ?? null };
}

/** Date → ISO 8601 เวลาไทย เช่น 2026-10-08T14:30:00+07:00 */
export function toThaiIso(date) {
  return `${new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`;
}

/** ใช้กับ app.set('json replacer') ให้ทุก Date ใน response เป็นเวลาไทย */
export function jsonReplacer(key, value) {
  const raw = this[key];
  return raw instanceof Date ? toThaiIso(raw) : value;
}
