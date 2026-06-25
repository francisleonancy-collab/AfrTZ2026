import { jsonResponse, errorResponse } from './middleware/utils.js';
import { CodeRepository } from './repositories/CodeRepository.js';
import { AIRepository } from './repositories/AIRepository.js';
import { PartnerRepository } from './repositories/PartnerRepository.js';
import { AIService } from './services/AIService.js';
import { CoreController } from './controllers/CoreController.js';
import { CampaignController } from './controllers/CampaignController.js';
import { ReviewController } from './controllers/ReviewController.js';
import { PartnerController } from './controllers/PartnerController.js';
import { AdminController } from './controllers/AdminController.js';
import { IntelligenceController } from './controllers/IntelligenceController.js';
import { PaymentController } from './controllers/PaymentController.js';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code, X-Admin-Token, X-Partner-Id',
    }});

    const url = new URL(req.url);
    const path = url.pathname;

    // Dependencies (IoC)
    const codeRepo = new CodeRepository(env.CODES_KV);
    const aiRepo = new AIRepository(env.DB);
    const partnerRepo = new PartnerRepository(env.DB);
    const aiService = new AIService(env);

    // Controllers
    const core = new CoreController(codeRepo, aiService, aiRepo);
    const campaign = new CampaignController(codeRepo, aiService, aiRepo);
    const review = new ReviewController(codeRepo, aiService, aiRepo);
    const partner = new PartnerController(partnerRepo);
    const admin = new AdminController(codeRepo, aiRepo, aiService);
    const intelligence = new IntelligenceController(codeRepo, aiService, aiRepo);
    const payment = new PaymentController(codeRepo);

    try {
      // Dynamic Routing / Static Registry
      const staticRoutes = {
        'GET:/health': () => core.health(req, env),
        'POST:/validate': () => core.validate(req, env),
        'GET:/usage': () => core.usage(req, env),
        'POST:/generate': () => core.generate(req, env),
        'POST:/claim-promo': () => core.claimPromo(req, env),
        'GET:/config/pricing': () => core.getPricing(req, env),

        'GET:/api/campaigns': () => campaign.list(req, env),
        'POST:/api/generate/campaign': () => campaign.generate(req, env),

        'GET:/api/reviews': () => review.list(req, env),
        'POST:/api/reviews': () => review.create(req, env),
        'GET:/api/reputation': () => intelligence.getReputationMetrics(req, env),

        'GET:/api/dashboard': () => intelligence.getDashboard(req, env),
        'GET:/api/analytics/marketing': () => intelligence.getMarketingAnalytics(req, env),
        'POST:/api/insights/generate': () => intelligence.generateInsights(req, env),
        'GET:/api/insights': () => intelligence.listInsights(req, env),

        'POST:/api/partners/register': () => partner.register(req, env),
        'GET:/api/partners/dashboard': () => partner.dashboard(req, env),
        'POST:/api/referrals/create': () => partner.createReferral(req, env),
        'GET:/api/referrals': () => partner.listReferrals(req, env),

        'POST:/clickpesa-create': () => payment.clickPesaCreate(req, env),
        'POST:/azampay-create': () => payment.azamPayCreate(req, env),

        'GET:/admin/codes': () => admin.listCodes(req, env),
        'POST:/admin/generate': () => admin.generateCode(req, env),
        'POST:/admin/revoke': () => admin.revokeCode(req, env),
        'POST:/admin/renew': () => admin.renewCode(req, env),
        'POST:/admin/pricing': () => admin.updatePricing(req, env),
        'GET:/api/ai/analytics': () => admin.getAIAnalytics(req, env),
      };

      const routeKey = `${req.method}:${path}`;
      if (staticRoutes[routeKey]) return await staticRoutes[routeKey]();

      // Dynamic Path segments
      if (path.startsWith('/api/campaigns/') && req.method === 'GET') {
        const id = path.split('/').pop();
        return campaign.getById(req, env, id);
      }
      if (path.startsWith('/api/insights/') && req.method === 'GET') {
        const id = path.split('/').pop();
        return intelligence.getInsightById(req, env, id);
      }

      return errorResponse('Not found', 404, env);
    } catch (e) {
      console.error('Worker error:', e);
      return errorResponse('Internal server error: ' + e.message, 500, env);
    }
  }
};
