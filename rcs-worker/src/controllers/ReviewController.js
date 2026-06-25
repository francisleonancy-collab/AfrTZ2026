import { jsonResponse, errorResponse } from '../middleware/utils.js';
import { PLANS } from '../config/index.js';
import { nowD } from '../middleware/auth.js';

export class ReviewController {
  constructor(codeRepo, aiService, aiRepo) {
    this.codeRepo = codeRepo;
    this.aiService = aiService;
    this.aiRepo = aiRepo;
  }

  async list(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const prefix = `review:${v.code}:`;
    const list = await this.codeRepo.list(prefix);
    const keys = list.keys;

    // Performance: parallel fetching
    const reviewsData = await Promise.all(keys.map(k => this.codeRepo.get(k.name)));

    const reviews = reviewsData
      .filter(d => d !== null)
      .map(data => {
        const { analysis, response, ...summary } = data;
        return { ...summary, sentiment: analysis?.sentiment_label, escalated: analysis?.escalation?.escalate };
      });

    reviews.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return jsonResponse({ success: true, reviews }, 200, env);
  }

  async create(req, env) {
    const code = req.headers.get('X-Access-Code');
    const body = await req.json().catch(() => ({}));
    const v = await this.codeRepo.findByCode(code || body.code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const { review_text, property_name, property_type, review_source, review_rating } = body;
    if (!review_text) return errorResponse('Review text required.', 400, env);

    const limit = PLANS[v.plan]?.limit ?? 30;
    if (limit !== -1 && (v.used || 0) >= limit) return errorResponse('Limit reached.', 429, env);

    const FALLBACK_PROMPT = `Analyze review for {{property_name}}. Return JSON.`;
    const { content: promptTpl, versionId } = await this.aiRepo.getPrompt('review', FALLBACK_PROMPT);

    const prompt = promptTpl
      .replace('{{property_name}}', property_name || 'Property')
      .replace('{{property_type}}', property_type || 'Hotel')
      .replace('{{review_source}}', review_source || 'Unknown')
      .replace('{{review_rating}}', review_rating || 'N/A')
      .replace('{{review_text}}', review_text);

    const startTime = Date.now();
    try {
      const isPaid = PLANS[v.plan]?.isPaid ?? false;
      const result = await this.aiService.generate(prompt, isPaid);

      await this.aiRepo.trackUsage({
        orgId: v.code,
        module: 'review',
        prompt_version_id: versionId,
        model: result.source,
        input_tokens: result.usage.input,
        output_tokens: result.usage.output,
        total_tokens: result.usage.total,
        latency: Date.now() - startTime
      });

      let analysisData;
      try {
        const cleanJson = result.text.includes('```json') ? result.text.split('```json')[1].split('```')[0].trim() : result.text.trim();
        analysisData = JSON.parse(cleanJson);
      } catch (e) {
        throw new Error('AI returned invalid JSON');
      }

      const reviewId = Date.now().toString();
      const review = {
        id: reviewId,
        code: v.code,
        source: review_source,
        rating: review_rating,
        text: review_text,
        property: { type: property_type, name: property_name },
        analysis: analysisData.analysis,
        response: analysisData.response,
        created_at: nowD().toISOString()
      };

      await this.codeRepo.save(`review:${v.code}:${reviewId}`, review);
      await this.codeRepo.updateUsage(v.code);

      return jsonResponse({ success: true, review, source: result.source }, 200, env);
    } catch (e) {
      return errorResponse(e.message, 500, env);
    }
  }
}
