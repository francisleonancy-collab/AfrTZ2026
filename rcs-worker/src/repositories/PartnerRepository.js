export class PartnerRepository {
  constructor(db) {
    this.db = db;
  }

  async createPartner(data) {
    const refCode = 'REF' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const res = await this.db.prepare(`
      INSERT INTO partners (id, organization_name, partner_type, contact_name, email, referral_code)
      VALUES (hex(randomblob(16)), ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(data.organizationName, data.partnerType || 'Agency', data.contactName, data.email, refCode).first();
    return { id: res.id, refCode };
  }

  async getPartnerById(id) {
    return await this.db.prepare(`SELECT * FROM partners WHERE id = ?`).bind(id).first();
  }

  async createReferral(data) {
    const res = await this.db.prepare(`
      INSERT INTO referrals (id, partner_id, lead_name, lead_email, organization_name, referral_status)
      VALUES (hex(randomblob(16)), ?, ?, ?, ?, 'Pending')
      RETURNING id
    `).bind(data.partnerId, data.leadName, data.leadEmail, data.organizationName).first();
    return res.id;
  }

  async getReferralsByPartner(partnerId) {
    const res = await this.db.prepare(`SELECT * FROM referrals WHERE partner_id = ?`).bind(partnerId).all();
    return res.results || [];
  }

  async getPartnerAnalytics(partnerId) {
    const referrals = await this.db.prepare(`SELECT COUNT(*) as total FROM referrals WHERE partner_id = ?`).bind(partnerId).first();
    const commissions = await this.db.prepare(`
      SELECT SUM(amount) as paid
      FROM commissions
      WHERE partner_id = ? AND status = 'paid'
    `).bind(partnerId).first();

    return {
      totalReferrals: referrals?.total || 0,
      activeCustomers: 0,
      pendingCommissions: 0,
      paidCommissions: commissions?.paid || 0
    };
  }
}
