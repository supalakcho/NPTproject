// Mock API ฝั่งแอดมิน: ยี่ห้อ รุ่น เครื่อง สมาชิก รายงาน ตั้งค่า audit log
// mockApi.js เป็นผู้เรียก registerAdminRoutes แล้วส่ง helper มาให้ (เลี่ยง circular import)
import { toThaiIso } from '../utils/datetime.js';
import { validateBrand, validateModel, validateNotebook, validateProfile, validateSettings } from '../utils/validate.js';
import { ROLES } from './mockData.js';

const SETTING_META = {
  maxLoanHours: 'ระยะเวลายืมสูงสุดต่อครั้ง (ชั่วโมง)',
  reservationMaxDaysAhead: 'จองล่วงหน้าได้ไม่เกิน (วัน)',
  reservationGraceMinutes: 'เวลาผ่อนผันรับเครื่องหลังเริ่มจอง (นาที)',
  reminderBeforeMinutes: 'แจ้งเตือนก่อนครบกำหนดคืน (นาที)',
  maxActiveLoansPerUser: 'จำนวนเครื่องที่ยืมพร้อมกันได้สูงสุดต่อคน',
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function registerAdminRoutes(H) {
  const {
    addRoute, MockError: E, ok, created, listResult, byId, iso, nextId, audit, notebookView, modelView, userView,
    loanView, reservationView, currentStatus, loanStatus, loanIsLate, isReservationLive, activeLoanOf, isLoanHeld,
    includesText, validationError, listNotebooks, fullName,
  } = H;

  const BRAND = { perm: 'brand.manage' };
  const MODEL = { perm: 'model.manage' };
  const NB_CREATE = { perm: 'notebook.create' };
  const NB_UPDATE = { perm: 'notebook.update' };
  const NB_DELETE = { perm: 'notebook.delete' };
  const USER_VIEW = { perm: 'user.view_all' };
  const USER_EDIT = { perm: 'user.update_any' };
  const REPORT = { perm: 'report.view' };
  const bool = (v) => v === 'true';

  const brandView = (b) => ({
    id: b.id, name: b.name, createdAt: iso(b.createdAt), updatedAt: iso(b.updatedAt), deletedAt: iso(b.deletedAt),
  });

  const liveReservations = (db, now, notebookId) => db.reservations.filter((r) => r.notebookId === notebookId && isReservationLive(r, now));

  // ---------- ยี่ห้อ B2–B6 ----------
  addRoute('GET', '/brands', ({ db, query }) => {
    const items = db.brands.filter((b) => (bool(query.includeDeleted) || !b.deletedAt) && (!query.keyword || includesText(b.name, query.keyword)));
    return listResult(items, query, { name: (b) => b.name.toLowerCase(), createdAt: (b) => b.createdAt }, 'name:asc', brandView);
  }, BRAND);

  const nameTaken = (db, name, exceptId) => db.brands.some((b) => !b.deletedAt && b.id !== exceptId && b.name.toLowerCase() === name.trim().toLowerCase());

  addRoute('POST', '/brands', (ctx) => {
    const { db, now, body } = ctx;
    const { valid, errors } = validateBrand(body ?? {});
    if (!valid) throw validationError(errors);
    if (nameTaken(db, body.name)) throw new E('BRAND_NAME_TAKEN');
    const b = { id: nextId(db, 'brands'), name: body.name.trim(), createdAt: now, updatedAt: now, deletedAt: null };
    db.brands.push(b);
    audit(ctx, 'CREATE', 'brands', b.id, null, { name: b.name });
    return created(brandView(b));
  }, BRAND);

  addRoute('PATCH', '/brands/([^/]+)', (ctx) => {
    const { db, now, params, body } = ctx;
    const b = byId(db.brands, params[0]);
    if (!b || b.deletedAt) throw new E('BRAND_NOT_FOUND');
    const { valid, errors } = validateBrand({ name: body?.name ?? b.name });
    if (!valid) throw validationError(errors);
    if (nameTaken(db, body.name, b.id)) throw new E('BRAND_NAME_TAKEN');
    const old = b.name;
    Object.assign(b, { name: body.name.trim(), updatedAt: now });
    audit(ctx, 'UPDATE', 'brands', b.id, { name: old }, { name: b.name });
    return ok(brandView(b));
  }, BRAND);

  addRoute('DELETE', '/brands/([^/]+)', (ctx) => {
    const { db, now, params } = ctx;
    const b = byId(db.brands, params[0]);
    if (!b || b.deletedAt) throw new E('BRAND_NOT_FOUND');
    const activeModels = db.models.filter((m) => m.brandId === b.id && !m.deletedAt).length;
    if (activeModels) throw new E('BRAND_IN_USE', { activeModels });
    b.deletedAt = now;
    audit(ctx, 'DELETE', 'brands', b.id, { name: b.name }, null);
    return ok(null);
  }, BRAND);

  addRoute('POST', '/brands/([^/]+)/restore', (ctx) => {
    const { db, now, params } = ctx;
    const b = byId(db.brands, params[0]);
    if (!b) throw new E('BRAND_NOT_FOUND');
    Object.assign(b, { deletedAt: null, updatedAt: now });
    audit(ctx, 'UPDATE', 'brands', b.id, { deletedAt: 'set' }, { event: 'restore' });
    return ok(brandView(b));
  }, BRAND);

  // ---------- รุ่น D3–D7 ----------
  const modelFields = (body) => ({
    brandId: Number(body.brandId), modelName: String(body.modelName).trim(), cpu: String(body.cpu).trim(),
    ramGb: Number(body.ramGb), storageGb: Number(body.storageGb), screenInch: Number(body.screenInch), os: String(body.os).trim(),
  });
  const modelNameTaken = (db, brandId, name, exceptId) => db.models.some((m) => !m.deletedAt && m.id !== exceptId
    && m.brandId === brandId && m.modelName.toLowerCase() === name.toLowerCase());

  addRoute('POST', '/notebook-models', (ctx) => {
    const { db, now, body } = ctx;
    const { valid, errors } = validateModel(body ?? {});
    if (!valid) throw validationError(errors);
    const f = modelFields(body);
    const brand = byId(db.brands, f.brandId);
    if (!brand || brand.deletedAt) throw new E('BRAND_NOT_FOUND');
    if (modelNameTaken(db, f.brandId, f.modelName)) throw new E('MODEL_NAME_TAKEN');
    const m = { id: nextId(db, 'models'), ...f, imageUrl: null, createdAt: now, updatedAt: now, deletedAt: null };
    db.models.push(m);
    audit(ctx, 'CREATE', 'notebook_models', m.id, null, f);
    return created(modelView(db, m));
  }, MODEL);

  addRoute('PATCH', '/notebook-models/([^/]+)', (ctx) => {
    const { db, now, params, body } = ctx;
    const m = byId(db.models, params[0]);
    if (!m || m.deletedAt) throw new E('MODEL_NOT_FOUND');
    const merged = { ...m, ...(body ?? {}) };
    const { valid, errors } = validateModel(merged);
    if (!valid) throw validationError(errors);
    const f = modelFields(merged);
    const brand = byId(db.brands, f.brandId);
    if (!brand || brand.deletedAt) throw new E('BRAND_NOT_FOUND');
    if (modelNameTaken(db, f.brandId, f.modelName, m.id)) throw new E('MODEL_NAME_TAKEN');
    const old = { modelName: m.modelName, ramGb: m.ramGb, storageGb: m.storageGb };
    Object.assign(m, f, { updatedAt: now });
    audit(ctx, 'UPDATE', 'notebook_models', m.id, old, f);
    return ok(modelView(db, m));
  }, MODEL);

  addRoute('POST', '/notebook-models/([^/]+)/image', (ctx) => {
    const { db, now, params, file } = ctx;
    const m = byId(db.models, params[0]);
    if (!m || m.deletedAt) throw new E('MODEL_NOT_FOUND');
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new E('INVALID_FILE');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140"><rect width="200" height="140" fill="#d0d7de"/>'
      + '<text x="100" y="78" font-size="16" text-anchor="middle" fill="#14213d">รูปจำลอง</text></svg>';
    m.imageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    m.updatedAt = now;
    audit(ctx, 'UPDATE', 'notebook_models', m.id, null, { event: 'image' });
    return ok(modelView(db, m));
  }, MODEL);

  addRoute('DELETE', '/notebook-models/([^/]+)', (ctx) => {
    const { db, now, params } = ctx;
    const m = byId(db.models, params[0]);
    if (!m || m.deletedAt) throw new E('MODEL_NOT_FOUND');
    const activeNotebooks = db.notebooks.filter((n) => n.modelId === m.id && !n.deletedAt).length;
    if (activeNotebooks) throw new E('MODEL_IN_USE', { activeNotebooks });
    m.deletedAt = now;
    audit(ctx, 'DELETE', 'notebook_models', m.id, { modelName: m.modelName }, null);
    return ok(null);
  }, MODEL);

  addRoute('POST', '/notebook-models/([^/]+)/restore', (ctx) => {
    const { db, now, params } = ctx;
    const m = byId(db.models, params[0]);
    if (!m) throw new E('MODEL_NOT_FOUND');
    if (byId(db.brands, m.brandId)?.deletedAt) throw new E('BRAND_NOT_FOUND');
    Object.assign(m, { deletedAt: null, updatedAt: now });
    audit(ctx, 'UPDATE', 'notebook_models', m.id, null, { event: 'restore' });
    return ok(modelView(db, m));
  }, MODEL);

  // ---------- เครื่อง N5–N8 ----------
  const nbFields = ['modelId', 'assetCode', 'serialNumber', 'conditionStatus', 'conditionNote', 'purchasedAt'];

  function checkNotebookUnique(db, f, exceptId) {
    if (db.notebooks.some((n) => n.id !== exceptId && n.assetCode.toLowerCase() === f.assetCode.toLowerCase())) throw new E('ASSET_CODE_TAKEN');
    if (f.serialNumber && db.notebooks.some((n) => n.id !== exceptId && n.serialNumber?.toLowerCase() === f.serialNumber.toLowerCase())) {
      throw new E('SERIAL_NUMBER_TAKEN');
    }
  }

  addRoute('POST', '/notebooks', (ctx) => {
    const { db, now, body } = ctx;
    const input = { conditionStatus: 'normal', ...(body ?? {}) };
    const { valid, errors } = validateNotebook(input);
    if (!valid) throw validationError(errors);
    const model = byId(db.models, input.modelId);
    if (!model || model.deletedAt) throw new E('MODEL_NOT_FOUND');
    const f = {
      modelId: model.id, assetCode: input.assetCode.trim(), serialNumber: input.serialNumber?.trim() || null,
      conditionStatus: input.conditionStatus, conditionNote: input.conditionNote?.trim() || null, purchasedAt: input.purchasedAt || null,
    };
    checkNotebookUnique(db, f);
    const nb = { id: nextId(db, 'notebooks'), ...f, createdAt: now, updatedAt: now, deletedAt: null };
    db.notebooks.push(nb);
    audit(ctx, 'CREATE', 'notebooks', nb.id, null, { assetCode: nb.assetCode });
    return created(notebookView(db, nb, now, true));
  }, NB_CREATE);

  addRoute('PATCH', '/notebooks/([^/]+)', (ctx) => {
    const { db, now, params, body } = ctx;
    const nb = byId(db.notebooks, params[0]);
    if (!nb || nb.deletedAt) throw new E('NOTEBOOK_NOT_FOUND');
    const merged = { ...nb, ...(body ?? {}) };
    const { valid, errors } = validateNotebook(merged);
    if (!valid) throw validationError(errors);
    const model = byId(db.models, merged.modelId);
    if (!model || model.deletedAt) throw new E('MODEL_NOT_FOUND');
    const f = {
      modelId: model.id, assetCode: merged.assetCode.trim(), serialNumber: merged.serialNumber?.trim() || null,
      conditionStatus: merged.conditionStatus, conditionNote: merged.conditionNote?.trim() || null, purchasedAt: merged.purchasedAt || null,
    };
    checkNotebookUnique(db, f, nb.id);

    const live = liveReservations(db, now, nb.id);
    if (f.conditionStatus === 'retired' && nb.conditionStatus !== 'retired' && (activeLoanOf(db, nb.id) || live.length)) {
      throw new E('NOTEBOOK_HAS_COMMITMENTS', { activeLoans: activeLoanOf(db, nb.id) ? 1 : 0, upcomingReservations: live.length });
    }
    const becomesUnavailable = ['damaged', 'maintenance'].includes(f.conditionStatus) && f.conditionStatus !== nb.conditionStatus;
    const affected = becomesUnavailable
      ? live.map((r) => ({ id: r.id, startAt: iso(r.startAt), userFullName: fullName(byId(db.users, r.userId)) }))
      : [];

    const old = Object.fromEntries(nbFields.map((k) => [k, nb[k]]));
    Object.assign(nb, f, { updatedAt: now });
    audit(ctx, 'UPDATE', 'notebooks', nb.id, old, f);
    return ok({ notebook: notebookView(db, nb, now, true), warnings: { affectedReservations: affected } });
  }, NB_UPDATE);

  addRoute('DELETE', '/notebooks/([^/]+)', (ctx) => {
    const { db, now, params } = ctx;
    const nb = byId(db.notebooks, params[0]);
    if (!nb || nb.deletedAt) throw new E('NOTEBOOK_NOT_FOUND');
    const activeLoans = activeLoanOf(db, nb.id) ? 1 : 0;
    const upcomingReservations = liveReservations(db, now, nb.id).length;
    if (activeLoans || upcomingReservations) throw new E('NOTEBOOK_HAS_COMMITMENTS', { activeLoans, upcomingReservations });
    nb.deletedAt = now;
    audit(ctx, 'DELETE', 'notebooks', nb.id, { assetCode: nb.assetCode }, null);
    return ok(null);
  }, NB_DELETE);

  addRoute('POST', '/notebooks/([^/]+)/restore', (ctx) => {
    const { db, now, params } = ctx;
    const nb = byId(db.notebooks, params[0]);
    if (!nb) throw new E('NOTEBOOK_NOT_FOUND');
    Object.assign(nb, { deletedAt: null, updatedAt: now });
    audit(ctx, 'UPDATE', 'notebooks', nb.id, null, { event: 'restore' });
    return ok(notebookView(db, nb, now, true));
  }, NB_UPDATE);

  // ---------- สมาชิก U1–U7 ----------
  const activeAdmins = (db) => db.users.filter((u) => u.roleCode === 'admin' && u.isActive && !u.deletedAt);
  const isLastAdmin = (db, u) => u.roleCode === 'admin' && u.isActive && activeAdmins(db).length <= 1;
  const findUser = (db, id) => {
    const u = byId(db.users, id);
    if (!u) throw new E('USER_NOT_FOUND');
    return u;
  };

  addRoute('GET', '/users', ({ db, query }) => {
    const items = db.users.filter((u) => (bool(query.includeDeleted) || !u.deletedAt)
      && (!query.roleId || u.roleId === Number(query.roleId))
      && (query.isActive === undefined || query.isActive === '' || u.isActive === bool(query.isActive))
      && (!query.keyword || includesText(`${u.firstName} ${u.lastName} ${u.email} ${u.memberCode ?? ''}`, query.keyword)));
    return listResult(items, query, {
      createdAt: (u) => u.createdAt, firstName: (u) => u.firstName, email: (u) => u.email, lastLoginAt: (u) => u.lastLoginAt ?? 0,
    }, 'createdAt:desc', (u) => userView(u, true));
  }, USER_VIEW);

  addRoute('GET', '/users/([^/]+)', ({ db, params }) => {
    const u = findUser(db, params[0]);
    return ok({ ...userView(u, true), activeLoanCount: db.loans.filter((l) => l.userId === u.id && isLoanHeld(l)).length });
  }, USER_VIEW);

  addRoute('PATCH', '/users/([^/]+)', (ctx) => {
    const { db, now, params, body } = ctx;
    const u = findUser(ctx.db, params[0]);
    const b = body ?? {};
    const merged = { firstName: u.firstName, lastName: u.lastName, phone: u.phone, ...b };
    const { valid, errors } = validateProfile(merged);
    if (b.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email).trim())) errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (!valid || errors.email) throw validationError(errors);

    if (b.email !== undefined && db.users.some((x) => x.id !== u.id && x.email.toLowerCase() === b.email.trim().toLowerCase())) throw new E('EMAIL_TAKEN');
    if (b.memberCode && db.users.some((x) => x.id !== u.id && x.memberCode === b.memberCode.trim())) throw new E('MEMBER_CODE_TAKEN');
    if (b.roleId !== undefined && b.roleId !== u.roleId) {
      const role = Object.values(ROLES).find((r) => r.id === Number(b.roleId));
      if (!role) throw new E('REFERENCE_NOT_FOUND');
      if (isLastAdmin(db, u)) throw new E('LAST_ADMIN');
      Object.assign(u, { roleId: role.id, roleCode: role.code, roleName: role.name });
    }
    const old = { firstName: u.firstName, lastName: u.lastName, phone: u.phone, email: u.email };
    Object.assign(u, {
      firstName: merged.firstName.trim(), lastName: merged.lastName.trim(), phone: merged.phone.trim(),
      ...(b.email !== undefined ? { email: b.email.trim() } : {}),
      ...(b.memberCode !== undefined ? { memberCode: b.memberCode.trim() || null } : {}),
      updatedAt: now,
    });
    audit(ctx, 'UPDATE', 'users', u.id, old, { firstName: u.firstName, lastName: u.lastName, phone: u.phone, email: u.email });
    return ok(userView(u, true));
  }, USER_EDIT);

  addRoute('POST', '/users/([^/]+)/suspend', (ctx) => {
    const { db, now, user, params } = ctx;
    const u = findUser(db, params[0]);
    if (u.id === user.id) throw new E('CANNOT_MODIFY_SELF');
    if (isLastAdmin(db, u)) throw new E('LAST_ADMIN');
    Object.assign(u, { isActive: false, updatedAt: now });
    audit(ctx, 'UPDATE', 'users', u.id, { isActive: true }, { event: 'suspend', isActive: false });
    return ok(userView(u, true));
  }, USER_EDIT);

  addRoute('POST', '/users/([^/]+)/activate', (ctx) => {
    const { db, now, params } = ctx;
    const u = findUser(db, params[0]);
    Object.assign(u, { isActive: true, updatedAt: now });
    audit(ctx, 'UPDATE', 'users', u.id, { isActive: false }, { event: 'activate', isActive: true });
    return ok(userView(u, true));
  }, USER_EDIT);

  addRoute('DELETE', '/users/([^/]+)', (ctx) => {
    const { db, now, user, params } = ctx;
    const u = findUser(db, params[0]);
    if (u.id === user.id) throw new E('CANNOT_MODIFY_SELF');
    if (isLastAdmin(db, u)) throw new E('LAST_ADMIN');
    const activeLoans = db.loans.filter((l) => l.userId === u.id && isLoanHeld(l)).length;
    if (activeLoans) throw new E('USER_HAS_ACTIVE_LOANS', { activeLoans });
    Object.assign(u, { deletedAt: now, updatedAt: now });
    audit(ctx, 'DELETE', 'users', u.id, { email: u.email }, null);
    return ok(null);
  }, USER_EDIT);

  addRoute('POST', '/users/([^/]+)/restore', (ctx) => {
    const { db, now, params } = ctx;
    const u = findUser(db, params[0]);
    Object.assign(u, { deletedAt: null, updatedAt: now });
    audit(ctx, 'UPDATE', 'users', u.id, null, { event: 'restore' });
    return ok(userView(u, true));
  }, USER_EDIT);

  // ---------- ตั้งค่า S2, S3 ----------
  const settingList = (db) => Object.entries(db.settings).map(([key, value]) => ({
    key, value, valueType: 'int', description: SETTING_META[key] ?? key,
    updatedBy: db.settingsMeta?.[key]?.updatedBy ?? null, updatedAt: iso(db.settingsMeta?.[key]?.updatedAt ?? null),
  }));

  addRoute('GET', '/settings', ({ db }) => ok(settingList(db)), { perm: 'setting.manage' });

  addRoute('PATCH', '/settings', (ctx) => {
    const { db, now, user, body } = ctx;
    const entries = Object.entries(body ?? {});
    const unknown = entries.find(([k]) => !(k in db.settings));
    if (unknown) throw new E('UNKNOWN_SETTING', [{ field: unknown[0], message: 'ไม่มีค่าตั้งค่านี้ในระบบ' }]);
    // ผิด 1 ตัว ไม่บันทึกเลย
    const { valid, errors } = validateSettings(Object.fromEntries(entries));
    if (!valid) throw validationError(errors);

    const old = {};
    db.settingsMeta ??= {};
    for (const [k, v] of entries) {
      old[k] = db.settings[k];
      db.settings[k] = Number(v);
      db.settingsMeta[k] = { updatedBy: user.id, updatedAt: now };
    }
    audit(ctx, 'UPDATE', 'settings', 0, old, Object.fromEntries(entries.map(([k]) => [k, db.settings[k]])));
    return ok(settingList(db));
  }, { perm: 'setting.manage' });

  // ---------- รายงาน P1–P5 ----------
  addRoute('GET', '/reports/summary', ({ db, now }) => {
    const out = { total: 0, available: 0, borrowed: 0, reserved: 0, damaged: 0, maintenance: 0, retired: 0 };
    for (const nb of db.notebooks.filter((n) => !n.deletedAt)) {
      out.total += 1;
      out[currentStatus(db, nb, now)] += 1;
    }
    return ok(out);
  }, REPORT);

  addRoute('GET', '/reports/notebooks', listNotebooks, REPORT);

  addRoute('GET', '/reports/outstanding-loans', ({ db, now, query }) => {
    const items = db.loans.filter((l) => isLoanHeld(l) && (!query.status || loanStatus(l, now) === query.status));
    const rank = (l) => (loanStatus(l, now) === 'overdue' ? 0 : 1);
    return listResult(items, { ...query, sort: 'priority:asc' }, {
      priority: (l) => `${rank(l)}-${String(l.dueAt).padStart(16, '0')}`,
    }, 'priority:asc', (l) => loanView(db, l, now));
  }, REPORT);

  addRoute('GET', '/reports/available-notebooks', ({ db, now, query }) => {
    const items = db.notebooks.filter((nb) => !nb.deletedAt && currentStatus(db, nb, now) === 'available'
      && (!query.modelId || nb.modelId === Number(query.modelId))
      && (!query.brandId || byId(db.models, nb.modelId).brandId === Number(query.brandId)));
    return listResult(items, query, { assetCode: (nb) => nb.assetCode }, 'assetCode:asc', (nb) => notebookView(db, nb, now, true));
  }, REPORT);

  addRoute('GET', '/reports/monthly-loans', ({ db, now, query }) => {
    const from = MONTH_RE.exec(query.fromMonth ?? '');
    const to = MONTH_RE.exec(query.toMonth ?? '');
    const errors = {};
    if (!from) errors.fromMonth = 'รูปแบบเดือนต้องเป็น YYYY-MM';
    if (!to) errors.toMonth = 'รูปแบบเดือนต้องเป็น YYYY-MM';
    let span = 0;
    if (from && to) {
      span = (Number(to[1]) - Number(from[1])) * 12 + (Number(to[2]) - Number(from[2]));
      if (span < 0) errors.toMonth = 'เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม';
      else if (span > 24) errors.toMonth = 'เลือกช่วงได้ไม่เกิน 24 เดือน';
    }
    if (Object.keys(errors).length) throw validationError(errors);

    const rows = [];
    for (let i = 0; i <= span; i += 1) {
      const idx = Number(from[1]) * 12 + (Number(from[2]) - 1) + i;
      rows.push({ loanMonth: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`, totalLoans: 0, lateLoans: 0 });
    }
    for (const l of db.loans) {
      if (l.status === 'cancelled') continue;
      const row = rows.find((r) => r.loanMonth === toThaiIso(l.borrowedAt).slice(0, 7));
      if (!row) continue;
      row.totalLoans += 1;
      if (loanIsLate(l, now)) row.lateLoans += 1;
    }
    return ok(rows);
  }, REPORT);

  // ---------- Audit log G1, G2 ----------
  const auditView = (db, a) => ({
    id: a.id, userId: a.userId, userFullName: fullName(byId(db.users, a.userId)), action: a.action, targetTable: a.targetTable,
    targetId: a.targetId, oldValues: a.oldValues, newValues: a.newValues, ipAddress: a.ipAddress, userAgent: a.userAgent,
    createdAt: iso(a.createdAt),
  });

  addRoute('GET', '/audit-logs', ({ db, query }) => {
    const from = query.from ? Date.parse(query.from) : null;
    const to = query.to ? Date.parse(query.to) : null;
    const items = db.auditLogs.filter((a) => (!query.userId || a.userId === Number(query.userId))
      && (!query.action || a.action.toLowerCase() === query.action.toLowerCase())
      && (!query.targetTable || a.targetTable === query.targetTable)
      && (!query.targetId || a.targetId === Number(query.targetId))
      && (from === null || a.createdAt >= from) && (to === null || a.createdAt <= to));
    return listResult(items, query, { createdAt: (a) => a.createdAt, id: (a) => a.id }, 'createdAt:desc', (a) => auditView(db, a));
  }, { perm: 'audit.view' });

  addRoute('GET', '/audit-logs/([^/]+)', ({ db, params }) => {
    const a = byId(db.auditLogs, params[0]);
    // spec ไม่มี error code สำหรับกรณีนี้ (ดูหัวข้อ "สิ่งที่ spec ยังไม่รองรับ")
    if (!a) throw new E('INTERNAL_ERROR', undefined, { status: 404, message: 'ไม่พบรายการ audit log' });
    return ok(auditView(db, a));
  }, { perm: 'audit.view' });
}
