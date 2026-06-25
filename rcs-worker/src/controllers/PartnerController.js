import { jsonResponse, errorResponse } from '../middleware/utils.js';

export class PartnerController {
  constructor(partnerRepo) {
    this.partnerRepo = partnerRepo;
  }

  async register(req, env) {
    const body = await req.json().catch(() => ({}));
    const { organizationName, partnerType, contactName, email, phone } = body;
    if (!organizationName || !email || !contactName) return errorResponse('Missing required fields.', 400, env);

    const partnerId = crypto.randomUUID();
    const referralCode = crypto.randomUUID().substring(0, 8).toUpperCase();

    try {
      await this.partnerRepo.save({
        id: partnerId,
        organization_name: organizationName,
        partner_type: partnerType || 'Consultant',
        contact_name: contactName,
        email: email.toLowerCase(),
        phone: phone || null,
        referral_code: referralCode
      });
      return jsonResponse({ success: true, partnerId, referralCode }, 200, env);
    } catch (e) {
      if (e.message.includes('UNIQUE')) return errorResponse('Email already registered.', 409, env);
      throw e;
    }
  }

  async dashboard(req, env) {
    const partnerId = req.headers.get('X-Partner-Id');
    if (!partnerId) return errorResponse('Partner ID required.', 401, env);
    const stats = await this.partnerRepo.getDashboardStats(partnerId);
    return jsonResponse({ success: true, analytics: stats }, 200, env);
  }

  async createReferral(req, env) {
    const body = await req.json().catch(() => ({}));
    const { partnerId, leadName, leadEmail, organizationName } = body;
    if (!partnerId || !leadName || !leadEmail) return errorResponse('Missing required fields.', 400, env);

    const referralId = crypto.randomUUID();
    await this.partnerRepo.createReferral({
      id: referralId,
      partner_id: partnerId,
      lead_name: leadName,
      lead_email: leadEmail.toLowerCase(),
      organization_name: organizationName || null
    });
    return jsonResponse({ success: true, referralId }, 200, env);
  }

  async listReferrals(req, env) {
    const partnerId = req.headers.get('X-Partner-Id');
    if (!partnerId) return errorResponse('Partner ID required.', 401, env);
    const referrals = await this.partnerRepo.getReferrals(partnerId);
    return jsonResponse({ success: true, referrals }, 200, env);
  }
}
