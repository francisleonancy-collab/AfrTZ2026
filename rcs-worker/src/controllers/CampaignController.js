import { jsonResponse, errorResponse } from '../middleware/utils.js';
import { PLANS } from '../config/index.js';
import { nowD } from '../middleware/auth.js';

export class CampaignController {
  constructor(codeRepo, aiService, aiRepo) {
    this.codeRepo = codeRepo;
    this.aiService = aiService;
    this.aiRepo = aiRepo;
  }

  async list(req, env) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const prefix = `campaign:${v.code}:`;
    const list = await this.codeRepo.list(prefix);
    const keys = list.keys;

    const campaignsData = await Promise.all(keys.map(k => this.codeRepo.get(k.name)));

    const campaigns = campaignsData
      .filter(d => d !== null)
      .map(data => {
        const { output, ...summary } = data;
        return summary;
      });

    campaigns.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return jsonResponse({ success: true, campaigns }, 200, env);
  }

  async getById(req, env, id) {
    const code = req.headers.get('X-Access-Code');
    const v = await this.codeRepo.findByCode(code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const campaign = await this.codeRepo.get(`campaign:${v.code}:${id}`);
    if (!campaign) return errorResponse('Campaign not found', 404, env);

    return jsonResponse({ success: true, campaign }, 200, env);
  }

  async generate(req, env) {
    const code = req.headers.get('X-Access-Code');
    const body = await req.json().catch(() => ({}));
    const v = await this.codeRepo.findByCode(code || body.code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const { business_type, promotion_name, promotion_description, offer, target_audience, campaign_goal } = body;
    if (!promotion_name || !promotion_description) return errorResponse('Name and description required.', 400, env);

    const limit = PLANS[v.plan]?.limit ?? 30;
    if (limit !== -1 && (v.used || 0) >= limit) return errorResponse('Limit reached.', 429, env);

    const SYSTEM_PROMPT = `You are a world-class Hospitality Marketing OS.
Your goal is to transform a promotion into a complete multi-channel marketing campaign.

Return a strictly valid JSON object with these keys:
1. campaign_brief: { theme, key_message, target_audience, marketing_angle, cta }
2. social_media: { instagram, facebook, linkedin }
3. email_campaign: { subject, preview_text, body, cta }
4. calendar: [ { day: 1, platform, topic, content_type, cta }, ... ] (total 30 days)

Tone: Professional, persuasive, and tailored to the hospitality industry.`;

    const USER_PROMPT = `Generate a campaign for:
Business Type: ${business_type || 'Hospitality'}
Promotion Name: ${promotion_name}
Description: ${promotion_description}
Offer: ${offer || 'Special Price'}
Target Audience: ${target_audience || 'General Guests'}
Goal: ${campaign_goal || 'Increase Bookings'}`;

    const startTime = Date.now();
    try {
      const isPaid = PLANS[v.plan]?.isPaid ?? false;
      const result = await this.aiService.generate(`${SYSTEM_PROMPT}\n\n${USER_PROMPT}`, isPaid);

      await this.aiRepo.trackUsage({
        orgId: v.code,
        module: 'campaign',
        prompt_version_id: 'v8.0-multi-agent',
        model: result.source,
        input_tokens: result.usage.input,
        output_tokens: result.usage.output,
        total_tokens: result.usage.total,
        latency: Date.now() - startTime
      });

      let campaignData;
      try {
        const cleanJson = result.text.includes('```json') ? result.text.split('```json')[1].split('```')[0].trim() : result.text.trim();
        campaignData = JSON.parse(cleanJson);
      } catch (e) {
        throw new Error('AI returned invalid JSON');
      }

      const campaignId = Date.now().toString();
      const campaign = {
        id: campaignId,
        code: v.code,
        name: promotion_name,
        input: body,
        output: campaignData,
        created_at: nowD().toISOString()
      };

      await this.codeRepo.save(`campaign:${v.code}:${campaignId}`, campaign);
      await this.codeRepo.updateUsage(v.code);

      return jsonResponse({ success: true, campaign, source: result.source }, 200, env);
    } catch (e) {
      return errorResponse(e.message, 500, env);
    }
  }
}
