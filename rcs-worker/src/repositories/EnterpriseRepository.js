export class EnterpriseRepository {
  constructor(db) {
    this.db = db;
  }

  async createGroup(name) {
    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO enterprise_groups (id, name) VALUES (?,?)`).bind(id, name).run();
    return id;
  }

  async getGroups() {
    const { results } = await this.db.prepare(`SELECT * FROM enterprise_groups ORDER BY created_at DESC`).all();
    return results;
  }

  async createProperty(groupId, name, type, country, city) {
    const id = crypto.randomUUID();
    await this.db.prepare(`
      INSERT INTO properties (id, enterprise_group_id, name, property_type, country, city)
      VALUES (?,?,?,?,?,?)
    `).bind(id, groupId, name, type, country || null, city || null).run();
    return id;
  }

  async getPropertiesByGroup(groupId) {
    const { results } = await this.db.prepare(`SELECT * FROM properties WHERE enterprise_group_id = ?`).bind(groupId).all();
    return results;
  }

  async updateWhiteLabel(orgId, config) {
    const { customDomain, logoUrl, primaryColor, secondaryColor } = config;
    const existing = await this.db.prepare(`SELECT id FROM white_label_configs WHERE organization_id = ?`).bind(orgId).first();

    if (existing) {
      await this.db.prepare(`
        UPDATE white_label_configs
        SET custom_domain = ?, logo_url = ?, primary_color = ?, secondary_color = ?
        WHERE organization_id = ?
      `).bind(customDomain, logoUrl, primaryColor, secondaryColor, orgId).run();
    } else {
      await this.db.prepare(`
        INSERT INTO white_label_configs (id, organization_id, custom_domain, logo_url, primary_color, secondary_color)
        VALUES (?,?,?,?,?,?)
      `).bind(crypto.randomUUID(), orgId, customDomain, logoUrl, primaryColor, secondaryColor).run();
    }
  }

  async getEnterpriseMetrics(groupId) {
    // Aggregated metrics for the entire group
    // In a real implementation, this would join with campaigns/reviews/etc.
    // For now, returning property and user counts as a foundation.
    const stats = await this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM properties WHERE enterprise_group_id = ?) as propertyCount,
        (SELECT COUNT(*) FROM property_users pu JOIN properties p ON pu.property_id = p.id WHERE p.enterprise_group_id = ?) as userCount
    `).bind(groupId, groupId).first();

    return {
      properties: stats?.propertyCount || 0,
      users: stats?.userCount || 0,
      campaigns: 0, // Placeholder: requires cross-KV/DB aggregation logic
      reviews: 0,
      avgRating: 0.0,
      mrr: 0
    };
  }
}
