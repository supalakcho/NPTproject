// A1–A3 สมัคร / login / logout
import { auth } from '../services/index.js';
import { handle } from './respond.js';

export const register = handle((ctx, req) => auth.register(ctx, req.body), { status: 201 });
export const login = handle((ctx, req) => auth.login(ctx, req.body));
export const logout = handle((ctx) => auth.logout(ctx));
