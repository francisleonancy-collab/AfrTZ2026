import { jsonResponse, errorResponse } from '../middleware/utils.js';
import { PLANS } from '../config/index.js';
import { isExp, daysLeft, rateLimit, fmtDate, addDays, nowD } from '../middleware/auth.js';

export class CoreController {
  constructor(codeRepo, aiService, aiRepo) {
    this.codeRepo = codeRepo;
    this.aiService = aiService;
    this.aiRepo = aiRepo;
  }

  async health(req, env) {
    return jsonResponse({ status: 'ok', ts: Date.now(), version: '8.0', architecture: 'Clean Modular' }, 200, env);
  }

  async validate(req, env) {
    const { code } = await req.json().catch(() => ({}));
    const v = await this.codeRepo.findByCode(code);

    if (!v) return errorResponse('Code not found. Contact support.', 401, env);
    if (!v.active) return errorResponse('Code deactivated. Please renew.', 401, env);
    if (isExp(v.expiry)) return errorResponse(`Code expired on ${v.expiry}. Please renew.`, 401, env);

    const limit = PLANS[v.plan]?.limit ?? 30;
    const used = v.used || 0;

    return jsonResponse({
      success: true, plan: v.plan, client: v.client, email: v.email || '',
      expiry: v.expiry, daysLeft: daysLeft(v.expiry),
      used, limit, remaining: limit === -1 ? -1 : Math.max(0, limit - used),
      isPaid: PLANS[v.plan]?.isPaid ?? false,
      enterpriseGroupId: v.enterpriseGroupId || null
    }, 200, env);
  }

  async usage(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);
    const limit = PLANS[v.plan]?.limit ?? 30;
    const used = v.used || 0;
    return jsonResponse({ used, limit, remaining: limit === -1 ? -1 : Math.max(0, limit - used) }, 200, env);
  }

  async generate(req, env) {
    const body = await req.json().catch(() => null);
    if (!body?.prompt) return errorResponse('Missing prompt.', 400, env);

    const { prompt, code } = body;
    const v = await this.codeRepo.findByCode(code);

    if (!v || !v.active || isExp(v.expiry)) return errorResponse('Unauthorised or expired.', 401, env);

    const limit = PLANS[v.plan]?.limit ?? 30;
    if (limit !== -1 && (v.used || 0) >= limit) return errorResponse('Monthly limit reached.', 429, env);

    const okCode = await rateLimit(env, `code:${code}:${Math.floor(Date.now() / 60000)}`, 10, 120);
    if (!okCode) return errorResponse('Too many requests.', 429, env);

    const startTime = Date.now();
    try {
      const isPaid = PLANS[v.plan]?.isPaid ?? false;
      const result = await this.aiService.generate(prompt.trim().slice(0, 2000), isPaid);

      await this.aiRepo.trackUsage({
        orgId: code, module: 'general', model: result.source,
        input_tokens: result.usage.input, output_tokens: result.usage.output,
        total_tokens: result.usage.total, latency: Date.now() - startTime
      });

      await this.codeRepo.updateUsage(code);
      return jsonResponse({ success: true, text: result.text, source: result.source, isPaid }, 200, env);
    } catch (e) {
      return errorResponse(e.message, 503, env);
    }
  }

  async claimPromo(req, env) {
    const { email, name, deviceId } = await req.json().catch(() => ({}));
    if (!email || !email.includes('@') || !name || !deviceId) return errorResponse('Invalid input.', 400, env);
    const code = 'PRMO' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const expiry = fmtDate(addDays(nowD(), 7));
    await this.codeRepo.save(code, {
      plan: 'Promo', client: name.trim(), email: email.toLowerCase(), deviceId,
      expiry, active: true, used: 0, limit: 3, created: fmtDate(nowD())
    });
    return jsonResponse({ success: true, code, expiry, limit: 3 }, 200, env);
  }

  async getPricing(req, env) {
    const pricing = await this.codeRepo.get('config:pricing') || {
      Starter: { usd: 3, tzs: 7500, limit: 30, days: 30 },
      Growth: { usd: 6, tzs: 15000, limit: 100, days: 30 },
      Premium: { usd: 9, tzs: 22500, limit: -1, days: 30 },
      Promo: { usd: 0, tzs: 0, limit: 3, days: 7 },
    };
    return jsonResponse({ success: true, pricing }, 200, env);
  }
}
