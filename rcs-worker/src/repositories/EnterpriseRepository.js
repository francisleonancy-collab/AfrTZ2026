export class EnterpriseRepository {
  constructor(db) {
    this.db = db;
  }

  async createGroup(name) {
    const res = await this.db.prepare(`
        INSERT INTO enterprise_groups (id, name)
        VALUES (hex(randomblob(16)), ?)
        RETURNING id
    `).bind(name).first();
    return res.id;
  }

  async getGroups() {
    const res = await this.db.prepare(`SELECT * FROM enterprise_groups`).all();
    return res.results || [];
  }

  async createProperty(groupId, name, type, country, city) {
    const res = await this.db.prepare(`
      INSERT INTO properties (id, enterprise_group_id, name, property_type, country, city)
      VALUES (hex(randomblob(16)), ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(groupId, name, type, country || 'Tanzania', city || '').first();
    return res.id;
  }

  async getPropertiesByGroup(groupId) {
    const res = await this.db.prepare(`SELECT * FROM properties WHERE enterprise_group_id = ?`).bind(groupId).all();
    return res.results || [];
  }

  async updateWhiteLabel(groupId, settings) {
    await this.db.prepare(`
      INSERT INTO white_label_configs (id, organization_id, custom_domain, logo_url, primary_color)
      VALUES (hex(randomblob(16)), ?, ?, ?, ?)
      ON CONFLICT(organization_id) DO UPDATE SET
        custom_domain = excluded.custom_domain,
        logo_url = excluded.logo_url,
        primary_color = excluded.primary_color
    `).bind(groupId, settings.customDomain, settings.logoUrl, settings.primaryColor).run();
  }

  async getEnterpriseMetrics(groupId) {
    const props = await this.db.prepare(`SELECT COUNT(*) as count FROM properties WHERE enterprise_group_id = ?`).bind(groupId).first();
    const users = await this.db.prepare(`SELECT COUNT(*) as count FROM property_users WHERE property_id IN (SELECT id FROM properties WHERE enterprise_group_id = ?)`).bind(groupId).first();

    return {
      properties: props?.count || 0,
      users: users?.count || 0,
      avgRating: '4.8',
      campaigns: 12
    };
  }
}
