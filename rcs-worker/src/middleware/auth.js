import { PLANS } from '../config/index.js';

export const nowD = () => new Date();
export const fmtDate = d => d.toISOString().split('T')[0];
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const daysLeft = e => Math.ceil((new Date(e) - nowD()) / 86400000);
export const isExp = e => daysLeft(e) <= 0;

export async function rateLimit(env, key, max, ttl) {
  const k = `rl:${key}`;
  const cur = parseInt(await env.RATELIMIT_KV.get(k) || '0');
  if (cur >= max) return false;
  await env.RATELIMIT_KV.put(k, String(cur + 1), { expirationTtl: ttl });
  return true;
}

export function adminOk(req, env) {
  return req.headers.get('X-Admin-Token') === env.ADMIN_TOKEN;
}
