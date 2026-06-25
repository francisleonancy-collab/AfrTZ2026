import { jsonResponse, errorResponse } from '../middleware/utils.js';
import { PLANS } from '../config/index.js';
import { nowD } from '../middleware/auth.js';

export class IntelligenceController {
  constructor(codeRepo, aiService, aiRepo) {
    this.codeRepo = codeRepo;
    this.aiService = aiService;
    this.aiRepo = aiRepo;
  }

  async getDashboard(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const [campaigns, reviews] = await Promise.all([
      this.codeRepo.list(`campaign:${v.code}:`),
      this.codeRepo.list(`review:${v.code}:`)
    ]);

    return jsonResponse({
      success: true,
      metrics: {
        campaignsCreated: campaigns.keys.length,
        reviewsProcessed: reviews.keys.length,
        plan: v.plan,
        usage: v.used || 0,
        limit: PLANS[v.plan]?.limit || 0,
        expiry: v.expiry,
        daysLeft: Math.ceil((new Date(v.expiry) - new Date()) / 86400000)
      }
    }, 200, env);
  }

  async getMarketingAnalytics(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const list = await this.codeRepo.list(`campaign:${v.code}:`);
    const keys = list.keys;
    const campaigns = await Promise.all(keys.map(k => this.codeRepo.get(k.name)));

    const typeMap = {};
    let totalContent = 0;

    for (const c of campaigns) {
      if (c) {
        const type = c.input?.business_type || 'other';
        typeMap[type] = (typeMap[type] || 0) + 1;
        totalContent += 5;
      }
    }

    return jsonResponse({
      success: true,
      analytics: {
        totalCampaigns: keys.length,
        totalAssetsGenerated: totalContent,
        campaignDistribution: typeMap,
        marketingScore: Math.min(100, (keys.length * 10) + 20)
      }
    }, 200, env);
  }

  async getReputationMetrics(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const list = await this.codeRepo.list(`review:${v.code}:`);
    const keys = list.keys;
    const reviews = await Promise.all(keys.map(k => this.codeRepo.get(k.name)));

    let totalRating = 0, count = 0, positive = 0, negative = 0, escalated = 0;
    const topicsMap = {};

    for (const data of reviews) {
      if (data) {
        count++;
        totalRating += (parseInt(data.rating) || 0);
        if (data.analysis?.sentiment_label === 'Positive') positive++;
        if (data.analysis?.sentiment_label === 'Negative') negative++;
        if (data.analysis?.escalation?.escalate) escalated++;
        (data.analysis?.topics || []).forEach(t => topicsMap[t] = (topicsMap[t] || 0) + 1);
      }
    }

    return jsonResponse({
      success: true,
      metrics: {
        avgRating: count > 0 ? (totalRating / count).toFixed(1) : 0,
        totalReviews: count,
        positive,
        negative,
        escalated,
        topTopics: Object.entries(topicsMap).sort((a,b) => b[1] - a[1]).slice(0, 5).map(e => e[0])
      }
    }, 200, env);
  }

  async generateInsights(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const [campaigns, reviews] = await Promise.all([
      this._getAllPrefixed(`campaign:${v.code}:`),
      this._getAllPrefixed(`review:${v.code}:`)
    ]);

    const dataset = {
      organization: { plan: v.plan, client: v.client },
      marketing: campaigns.map(c => ({ name: c.name, type: c.input?.business_type, date: c.created_at })),
      reputation: reviews.map(r => ({ rating: r.rating, sentiment: r.analysis?.sentiment_label, topics: r.analysis?.topics, date: r.created_at })),
      usage: { used: v.used, limit: PLANS[v.plan]?.limit }
    };

    const FALLBACK_PROMPT = `Generate executive report. Return JSON.`;
    const { content: promptTpl, versionId } = await this.aiRepo.getPrompt('intelligence', FALLBACK_PROMPT);
    const prompt = `${promptTpl}\n\nData:\n${JSON.stringify(dataset)}`;

    const startTime = Date.now();
    try {
      const result = await this.aiService.generate(prompt, true);
      await this.aiRepo.trackUsage({
        orgId: v.code,
        module: 'intelligence',
        prompt_version_id: versionId,
        model: result.source,
        input_tokens: result.usage.input,
        output_tokens: result.usage.output,
        total_tokens: result.usage.total,
        latency: Date.now() - startTime
      });

      let reportData;
      try {
        const cleanJson = result.text.includes('```json') ? result.text.split('```json')[1].split('```')[0].trim() : result.text.trim();
        reportData = JSON.parse(cleanJson);
      } catch (e) {
        throw new Error('AI returned invalid JSON');
      }

      const reportId = Date.now().toString();
      const report = { id: reportId, code: v.code, data: reportData, created_at: nowD().toISOString() };

      await this.codeRepo.save(`insight:${v.code}:${reportId}`, report);
      return jsonResponse({ success: true, report, source: result.source }, 200, env);
    } catch (e) {
      return errorResponse(e.message, 500, env);
    }
  }

  async listInsights(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const list = await this.codeRepo.list(`insight:${v.code}:`);
    const keys = list.keys;
    const reportsData = await Promise.all(keys.map(k => this.codeRepo.get(k.name)));

    const reports = reportsData
      .filter(r => r !== null)
      .map(r => ({ id: r.id, created_at: r.created_at }));

    return jsonResponse({ success: true, reports }, 200, env);
  }

  async getInsightById(req, env, id) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const report = await this.codeRepo.get(`insight:${v.code}:${id}`);
    if (!report) return errorResponse('Report not found', 404, env);
    return jsonResponse({ success: true, report }, 200, env);
  }

  async _getAllPrefixed(prefix) {
    const list = await this.codeRepo.list(prefix);
    const results = await Promise.all(list.keys.map(key => this.codeRepo.get(key.name)));
    return results.filter(r => r !== null);
  }
}
