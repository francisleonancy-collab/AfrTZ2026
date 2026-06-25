export class AIRepository {
  constructor(db) {
    this.db = db;
  }

  async getPrompt(module, fallback) {
    try {
      const res = await this.db.prepare(`
        SELECT v.prompt_content, v.id as version_id
        FROM prompt_templates t
        JOIN prompt_versions v ON t.active_version = v.id
        WHERE t.module_name = ?
      `).bind(module).first();
      return res ? { content: res.prompt_content, versionId: res.version_id } : { content: fallback, versionId: null };
    } catch (e) {
      console.error('Registry lookup failed:', e);
      return { content: fallback, versionId: null };
    }
  }

  async trackUsage(meta) {
    try {
      const cost = (meta.total_tokens / 1000) * 0.002;
      await this.db.prepare(`
        INSERT INTO ai_requests (id, organization_id, module_name, prompt_version_id, model_name, input_tokens, output_tokens, total_tokens, estimated_cost, response_time_ms)
        VALUES (hex(randomblob(16)),?,?,?,?,?,?,?,?,?)
      `).bind(
        meta.orgId,
        meta.module,
        meta.prompt_version_id || null,
        meta.model,
        meta.input_tokens || 0,
        meta.output_tokens || 0,
        meta.total_tokens || 0,
        cost,
        meta.latency
      ).run();
    } catch(e) { console.error('Usage tracking failed:', e); }
  }

  async getAnalytics() {
    const stats = await this.db.prepare(`
      SELECT
        COUNT(*) as total_requests,
        SUM(total_tokens) as total_tokens,
        SUM(estimated_cost) as total_cost,
        AVG(response_time_ms) as avg_latency
      FROM ai_requests
      WHERE created_at > date('now', '-24 hours')
    `).first();

    const quality = await this.db.prepare(`SELECT AVG(overall_score) as avg_quality FROM ai_evaluations`).first();

    return {
      requests: stats?.total_requests || 0,
      tokens: stats?.total_tokens || 0,
      cost: stats?.total_cost || 0,
      latency: stats?.avg_latency || 0,
      quality: (quality?.avg_quality || 0) * 100
    };
  }
}
