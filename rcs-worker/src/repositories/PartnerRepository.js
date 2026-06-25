import { jsonResponse, errorResponse } from '../middleware/utils.js';

export class PartnerRepository {
  constructor(db) {
    this.db = db;
  }

  async findByEmail(email) {
    return await this.db.prepare(`SELECT * FROM partners WHERE email = ?`).bind(email.toLowerCase()).first();
  }

  async save(data) {
    const { id, organization_name, partner_type, contact_name, email, phone, referral_code } = data;
    await this.db.prepare(`
      INSERT INTO partners (id, organization_name, partner_type, contact_name, email, phone, referral_code)
      VALUES (?,?,?,?,?,?,?)
    `).bind(id, organization_name, partner_type, contact_name, email, phone, referral_code).run();
  }

  async getDashboardStats(partnerId) {
    return await this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM referrals WHERE partner_id = ?) as totalReferrals,
        (SELECT COUNT(*) FROM referrals WHERE partner_id = ? AND referral_status = 'customer') as activeCustomers,
        (SELECT IFNULL(SUM(amount), 0) FROM commissions WHERE partner_id = ? AND status = 'pending') as pendingCommissions,
        (SELECT IFNULL(SUM(amount), 0) FROM commissions WHERE partner_id = ? AND status = 'paid') as paidCommissions
    `).bind(partnerId, partnerId, partnerId, partnerId).first();
  }

  async createReferral(data) {
    const { id, partner_id, lead_name, lead_email, organization_name } = data;
    await this.db.prepare(`
      INSERT INTO referrals (id, partner_id, lead_name, lead_email, organization_name)
      VALUES (?,?,?,?,?)
    `).bind(id, partner_id, lead_name, lead_email, organization_name).run();
  }

  async getReferrals(partnerId) {
    const { results } = await this.db.prepare(`SELECT * FROM referrals WHERE partner_id = ? ORDER BY created_at DESC`).bind(partnerId).all();
    return results;
  }
}
