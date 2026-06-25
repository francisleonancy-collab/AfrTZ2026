import { jsonResponse, errorResponse } from '../middleware/utils.js';
import { PLANS } from '../config/index.js';
import { adminOk, fmtDate, addDays, nowD } from '../middleware/auth.js';

export class AdminController {
  constructor(codeRepo, aiRepo, aiService) {
    this.codeRepo = codeRepo;
    this.aiRepo = aiRepo;
    this.aiService = aiService;
  }

  async listCodes(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const list = await this.codeRepo.list();
    const codes = {};
    const rev = { Starter: 3, Growth: 6, Premium: 9, Promo: 0 };
    let mrr = 0, totalGen = 0, total = 0;

    for (const k of list.keys) {
      if (k.name.includes(':')) continue;
      const d = await this.codeRepo.get(k.name);
      if (d && d.plan !== 'Admin') {
        codes[k.name] = d;
        total++;
        if (d.active) mrr += (rev[d.plan] || 0);
        totalGen += (d.used || 0);
      }
    }
    return jsonResponse({ codes, stats: { total, mrr, totalGen } }, 200, env);
  }

  async generateCode(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const { plan, client, days, email } = await req.json().catch(() => ({}));
    if (!plan || !PLANS[plan]) return errorResponse('Invalid plan.', 400, env);
    if (!client) return errorResponse('Client name required.', 400, env);

    const pfx = plan === 'Promo' ? 'PRMO' : plan === 'Growth' ? 'GROW' : plan === 'Premium' ? 'PREM' : 'RCST';
    const code = pfx + Math.random().toString(36).substring(2, 6).toUpperCase();
    const expiry = fmtDate(addDays(nowD(), Math.min(parseInt(days) || 30, 365)));

    const data = {
      plan, client: client.slice(0, 60),
      email: (email || '').toLowerCase().trim(),
      expiry, active: true, used: 0,
      limit: PLANS[plan].limit,
      created: fmtDate(nowD())
    };

    await this.codeRepo.save(code, data);
    return jsonResponse({ success: true, code, ...data }, 200, env);
  }

  async revokeCode(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const { code } = await req.json().catch(() => ({}));
    if (!code) return errorResponse('Code required.', 400, env);
    const d = await this.codeRepo.findByCode(code);
    if (!d) return errorResponse('Code not found.', 404, env);
    d.active = false;
    await this.codeRepo.save(code, d);
    return jsonResponse({ success: true, message: `${code} deactivated.` }, 200, env);
  }

  async renewCode(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const { code, days } = await req.json().catch(() => ({}));
    if (!code) return errorResponse('Code required.', 400, env);
    const d = await this.codeRepo.findByCode(code);
    if (!d) return errorResponse('Code not found.', 404, env);
    d.expiry = fmtDate(addDays(nowD(), Math.min(parseInt(days) || 30, 365)));
    d.active = true; d.used = 0;
    await this.codeRepo.save(code, d);
    return jsonResponse({ success: true, message: `${code} renewed.`, newExpiry: d.expiry }, 200, env);
  }

  async updatePricing(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const pricing = await req.json().catch(() => null);
    if (!pricing) return errorResponse('Invalid pricing data.', 400, env);
    await this.codeRepo.save('config:pricing', pricing);
    return jsonResponse({ success: true, message: 'Pricing updated.' }, 200, env);
  }

  async getAIAnalytics(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const analytics = await this.aiRepo.getAnalytics();
    return jsonResponse({ success: true, analytics }, 200, env);
  }
}
