import { jsonResponse, errorResponse } from '../middleware/utils.js';

export class PartnerController {
  constructor(partnerRepo) {
    this.partnerRepo = partnerRepo;
  }

  async register(req, env) {
    const data = await req.json().catch(() => ({}));
    if (!data.email || !data.organizationName) return errorResponse('Missing fields.', 400, env);

    const partner = await this.partnerRepo.createPartner(data);
    return jsonResponse({ success: true, partnerId: partner.id, referralCode: partner.refCode }, 200, env);
  }

  async dashboard(req, env) {
    const partnerId = req.headers.get('X-Partner-Id');
    if (!partnerId) return errorResponse('PartnerId required.', 400, env);

    const analytics = await this.partnerRepo.getPartnerAnalytics(partnerId);
    return jsonResponse({ success: true, analytics }, 200, env);
  }

  async createReferral(req, env) {
    const data = await req.json().catch(() => ({}));
    if (!data.partnerId || !data.leadEmail) return errorResponse('Missing fields.', 400, env);

    const id = await this.partnerRepo.createReferral(data);
    return jsonResponse({ success: true, referralId: id }, 200, env);
  }

  async listReferrals(req, env) {
    const partnerId = req.headers.get('X-Partner-Id');
    if (!partnerId) return errorResponse('PartnerId required.', 400, env);

    const referrals = await this.partnerRepo.getReferralsByPartner(partnerId);
    return jsonResponse({ success: true, referrals }, 200, env);
  }
}
