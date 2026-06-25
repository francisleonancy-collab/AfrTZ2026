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

    // Performance: parallel fetching
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

  async generate(req, env) {
    const code = req.headers.get('X-Access-Code');
    const body = await req.json().catch(() => ({}));
    const v = await this.codeRepo.findByCode(code || body.code);
    if (!v) return errorResponse('Unauthorised', 401, env);

    const { promotion_name, promotion_description } = body;
    if (!promotion_name || !promotion_description) return errorResponse('Name and description required.', 400, env);

    const limit = PLANS[v.plan]?.limit ?? 30;
    if (limit !== -1 && (v.used || 0) >= limit) return errorResponse('Limit reached.', 429, env);

    const FALLBACK_PROMPT = `Create a campaign for {{promotion_name}}. Return JSON.`;
    const { content: promptTpl, versionId } = await this.aiRepo.getPrompt('campaign', FALLBACK_PROMPT);

    const prompt = promptTpl
      .replace('{{promotion_name}}', promotion_name)
      .replace('{{promotion_description}}', promotion_description);

    const startTime = Date.now();
    try {
      const isPaid = PLANS[v.plan]?.isPaid ?? false;
      const result = await this.aiService.generate(prompt, isPaid);

      await this.aiRepo.trackUsage({
        orgId: v.code,
        module: 'campaign',
        prompt_version_id: versionId,
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
