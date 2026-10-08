// R1–R5 การจอง
import { reservations, loans } from '../services/index.js';
import { handle } from './respond.js';

export const create = handle((ctx, req) => reservations.create(ctx, req.body), { status: 201 });
export const getById = handle((ctx, req) => reservations.getById(ctx, req.params.id));
export const pickup = handle((ctx, req) => loans.pickupReservation(ctx, req.params.id), { status: 201 });
export const cancel = handle((ctx, req) => reservations.cancel(ctx, req.params.id, req.body));
export const list = handle((ctx, req) => reservations.listAll(ctx, req.query));
