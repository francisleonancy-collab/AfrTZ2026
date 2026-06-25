import { PLANS } from '../config/index.js';
import { rateLimit } from '../middleware/auth.js';
import { jsonResponse, errorResponse } from '../middleware/utils.js';

export class PaymentController {
  constructor(codeRepo) {
    this.codeRepo = codeRepo;
  }

  async clickPesaCreate(req, env) {
    const { plan, email, name, phone } = await req.json().catch(()=>({}));
    if (!plan||!PLANS[plan]?.isPaid) return errorResponse('Invalid plan.', 400, env);
    if (!email) return errorResponse('Email required.', 400, env);

    if (!env.CLICKPESA_API_KEY || !env.CLICKPESA_CLIENT_ID) {
      return errorResponse('ClickPesa not configured.', 503, env);
    }

    const ip = req.headers.get('CF-Connecting-IP')||'unknown';
    const okIP = await rateLimit(env,`clickpesa:${ip}:${Math.floor(Date.now()/3600000)}`,5,3600);
    if (!okIP) return errorResponse('Too many attempts.', 429, env);

    const pricingCfg = await this.codeRepo.get('config:pricing');
    const amountTZS = pricingCfg?.[plan]?.tzs ?? ({Starter:7500,Growth:15000,Premium:22500}[plan]);
    const ref = `MKUDE_${plan}_${Date.now()}`;

    try {
      const tokenRes = await fetch('https://api.clickpesa.com/third-parties/generate-token', {
        method:'POST',
        headers:{'client-id': env.CLICKPESA_CLIENT_ID, 'api-key': env.CLICKPESA_API_KEY, 'Content-Type': 'application/json'},
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.token || tokenData.access_token;
      if (!accessToken) throw new Error('ClickPesa auth failed');

      const checkoutRes = await fetch('https://api.clickpesa.com/third-parties/payments/checkout-link', {
        method:'POST',
        headers:{'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          amount: String(amountTZS),
          currency: 'TZS',
          orderReference: ref,
          customerEmail: email,
          customerName: name || email,
          customerPhoneNumber: phone || undefined,
          webhookURL: `${env.WORKER_URL || ''}/clickpesa-callback`,
          redirectURL: `${env.ALLOWED_ORIGIN || 'https://mkude.com'}/?clickpesa=success`,
        }),
      });
      const checkout = await checkoutRes.json();
      const checkoutUrl = checkout.checkoutUrl || checkout.url || checkout.link;

      await this.codeRepo.save(`pending:clickpesa:${ref}`, {plan,email,name:name||email});
      return jsonResponse({ success:true, checkoutUrl, ref }, 200, env);
    } catch(e) {
      return errorResponse('ClickPesa failed: '+e.message, 502, env);
    }
  }

  async azamPayCreate(req, env) {
    const { plan, email, name, phone, provider, mode } = await req.json().catch(()=>({}));
    if (!plan||!PLANS[plan]?.isPaid) return errorResponse('Invalid plan.', 400, env);

    if (!env.AZAMPAY_CLIENT_ID || !env.AZAMPAY_CLIENT_SECRET) {
      return errorResponse('AzamPay not configured.', 503, env);
    }

    const pricingCfg = await this.codeRepo.get('config:pricing');
    const amountTZS = pricingCfg?.[plan]?.tzs ?? ({Starter:7500,Growth:15000,Premium:22500}[plan]);
    const ref = `MKUDE_${plan}_${Date.now()}`;

    try {
      const authUrl = env.AZAMPAY_SANDBOX==='true' ? 'https://authenticator-sandbox.azampay.co.tz' : 'https://authenticator.azampay.co.tz';
      const tokenRes = await fetch(`${authUrl}/AppRegistration/GenerateToken`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({appName: env.AZAMPAY_APP_NAME, clientId: env.AZAMPAY_CLIENT_ID, clientSecret: env.AZAMPAY_CLIENT_SECRET}),
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.data?.accessToken;
      if (!accessToken) throw new Error('AzamPay auth failed');

      await this.codeRepo.save(`pending:azampay:${ref}`, {plan,email,name:name||email});

      return jsonResponse({ success:true, ref, message: 'Initiated' }, 200, env);
    } catch(e) {
      return errorResponse('AzamPay failed: '+e.message, 502, env);
    }
  }
}
