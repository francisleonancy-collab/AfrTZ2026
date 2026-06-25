import { jsonResponse, errorResponse } from '../middleware/utils.js';
import { adminOk } from '../middleware/auth.js';

export class EnterpriseController {
  constructor(enterpriseRepo, codeRepo) {
    this.enterpriseRepo = enterpriseRepo;
    this.codeRepo = codeRepo;
  }

  async createGroup(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const { name } = await req.json().catch(() => ({}));
    if (!name) return errorResponse('Group name required.', 400, env);

    const id = await this.enterpriseRepo.createGroup(name);
    return jsonResponse({ success: true, id }, 200, env);
  }

  async listGroups(req, env) {
    if (!adminOk(req, env)) return errorResponse('Unauthorised', 401, env);
    const groups = await this.enterpriseRepo.getGroups();
    return jsonResponse({ success: true, groups }, 200, env);
  }

  async createProperty(req, env) {
    const { groupId, name, type, country, city } = await req.json().catch(() => ({}));
    if (!groupId || !name || !type) return errorResponse('Missing fields.', 400, env);

    const id = await this.enterpriseRepo.createProperty(groupId, name, type, country, city);
    return jsonResponse({ success: true, id }, 200, env);
  }

  async listProperties(req, env) {
    const groupId = new URL(req.url).searchParams.get('groupId');
    if (!groupId) return errorResponse('groupId required.', 400, env);

    const properties = await this.enterpriseRepo.getPropertiesByGroup(groupId);
    return jsonResponse({ success: true, properties }, 200, env);
  }

  async configureWhiteLabel(req, env) {
    const body = await req.json().catch(() => ({}));
    const { organizationId, customDomain, logoUrl, primaryColor } = body;
    if (!organizationId) return errorResponse('organizationId required.', 400, env);

    await this.enterpriseRepo.updateWhiteLabel(organizationId, {
      customDomain, logoUrl, primaryColor, secondaryColor: body.secondaryColor
    });

    return jsonResponse({ success: true }, 200, env);
  }

  async getEnterpriseReport(req, env) {
    const groupId = new URL(req.url).searchParams.get('groupId');
    if (!groupId) return errorResponse('groupId required.', 400, env);

    const report = await this.enterpriseRepo.getEnterpriseMetrics(groupId);
    return jsonResponse({ success: true, report }, 200, env);
  }
}
