import { PLANS } from '../config/index.js';

export class CodeRepository {
  constructor(kv) {
    this.kv = kv;
  }

  async findByCode(code) {
    if (!code || typeof code !== 'string' || !/^[A-Z0-9]{4,12}$/.test(code.toUpperCase())) {
      return null;
    }
    const clean = code.toUpperCase();
    const data = await this.kv.get(clean, 'json');
    if (!data) return null;
    return { code: clean, ...data };
  }

  async save(code, data) {
    await this.kv.put(code.toUpperCase(), JSON.stringify(data));
  }

  async updateUsage(code, increment = 1) {
    const data = await this.findByCode(code);
    if (data) {
      data.used = (data.used || 0) + increment;
      const { code: _, ...cleanData } = data;
      await this.save(code, cleanData);
    }
  }

  async list(prefix) {
    return await this.kv.list({ prefix });
  }

  async get(key) {
    return await this.kv.get(key, 'json');
  }

  async delete(key) {
    await this.kv.delete(key);
  }
}
