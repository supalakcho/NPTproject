// อ่าน/เขียน query string ของหน้า (page, filter) เพื่อให้ลิงก์และปุ่มย้อนกลับใช้ได้
export function readQuery(search = globalThis.location?.search ?? '') {
  return Object.fromEntries(new URLSearchParams(search));
}

/** ตัดค่าว่างออก แล้วสร้าง query string (ไม่มี ?) */
export function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/** อัปเดต URL ของหน้าโดยไม่โหลดใหม่ (ไม่ทำให้เกิดประวัติเพิ่ม) */
export function writeQuery(params) {
  const qs = buildQuery(params);
  const url = location.pathname + (qs ? `?${qs}` : '');
  history.replaceState(null, '', url);
}

/** ตัดค่าว่าง/undefined ออกจากค่าในฟอร์มตัวกรอง */
export function cleanQuery(values) {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}
