export class CodeRepository {
  constructor(kv) {
    this.kv = kv;
  }

  async findByCode(code) {
    if (!code) return null;
    const data = await this.kv.get(code, 'json');
    if (!data) return null;
    return { code, ...data };
  }

  async get(key) {
    return await this.kv.get(key, 'json');
  }

  async save(key, data) {
    await this.kv.put(key, JSON.stringify(data));
  }

  async list(prefix) {
    return await this.kv.list({ prefix });
  }

  async updateUsage(code) {
    const data = await this.findByCode(code);
    if (data) {
      const { code: _, ...cleanData } = data;
      cleanData.used = (cleanData.used || 0) + 1;
      await this.save(code, cleanData);
    }
  }
}
