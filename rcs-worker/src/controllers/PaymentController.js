import { jsonResponse, errorResponse } from '../middleware/utils.js';
import { PLANS } from '../config/index.js';
import { nowD, fmtDate, addDays, rateLimit, hmacHex } from '../middleware/auth.js';

export class PaymentController {
  constructor(codeRepo) {
    this.codeRepo = codeRepo;
  }

  async clickPesaCreate(req, env) {
    const { plan, email, name, phone } = await req.json().catch(()=>({}));
    if (!plan||!PLANS[plan]?.isPaid) return errorResponse('Invalid plan.', 400, env);
    if (!email) return errorResponse('Email required.', 400, env);
    if (!env.CLICKPESA_API_KEY || !env.CLICKPESA_CLIENT_ID) {
      return errorResponse('ClickPesa not configured. Contact support.', 503, env);
    }
    const ip = req.headers.get('CF-Connecting-IP')||'unknown';
    const okIP = await rateLimit(env,`clickpesa:${ip}:${Math.floor(Date.now()/3600000)}`,5,3600);
    if (!okIP) return errorResponse('Too many payment attempts. Please try again later.', 429, env);

    const pricingCfg = await env.CODES_KV.get('config:pricing','json');
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
          webhookURL: `${env.WORKER_PUBLIC_URL || ''}/clickpesa-callback`,
          redirectURL: `${env.ALLOWED_ORIGIN || 'https://mkude.com'}/?clickpesa=success`,
        }),
      });
      const checkout = await checkoutRes.json();
      const checkoutUrl = checkout.checkoutUrl || checkout.url || checkout.link;
      if (!checkoutUrl) throw new Error('ClickPesa did not return a checkout URL');

      await env.CODES_KV.put(`pending:clickpesa:${ref}`, JSON.stringify({plan,email,name:name||email}), {expirationTtl:3600});

      return jsonResponse({ success:true, checkoutUrl, ref, amount:amountTZS, currency:'TZS' }, 200, env);
    } catch(e) {
      return errorResponse('ClickPesa payment setup failed: '+e.message, 502, env);
    }
  }

  async azamPayCreate(req, env) {
    const { plan, email, name, phone, provider, mode } = await req.json().catch(()=>({}));
    if (!plan||!PLANS[plan]?.isPaid) return errorResponse('Invalid plan.', 400, env);
    if (!email) return errorResponse('Email required.', 400, env);
    if (!env.AZAMPAY_CLIENT_ID || !env.AZAMPAY_CLIENT_SECRET || !env.AZAMPAY_APP_NAME) {
      return errorResponse('AzamPay not configured. Contact support.', 503, env);
    }
    const ip = req.headers.get('CF-Connecting-IP')||'unknown';
    const okIP = await rateLimit(env,`azampay:${ip}:${Math.floor(Date.now()/3600000)}`,5,3600);
    if (!okIP) return errorResponse('Too many payment attempts.', 429, env);

    const pricingCfg  = await env.CODES_KV.get('config:pricing','json');
    const amountTZS   = pricingCfg?.[plan]?.tzs ?? ({Starter:7500,Growth:15000,Premium:22500}[plan]);
    const ref = `MKUDE_${plan}_${Date.now()}`;
    const AUTH_BASE = env.AZAMPAY_SANDBOX==='true' ? 'https://authenticator-sandbox.azampay.co.tz' : 'https://authenticator.azampay.co.tz';
    const API_BASE  = env.AZAMPAY_SANDBOX==='true' ? 'https://sandbox.azampay.co.tz' : 'https://checkout.azampay.co.tz';

    try {
      const tokenRes = await fetch(`${AUTH_BASE}/AppRegistration/GenerateToken`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({appName: env.AZAMPAY_APP_NAME, clientId: env.AZAMPAY_CLIENT_ID, clientSecret: env.AZAMPAY_CLIENT_SECRET}),
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.data?.accessToken || tokenData.accessToken;
      if (!accessToken) throw new Error('AzamPay auth failed');

      await env.CODES_KV.put(`pending:azampay:${ref}`, JSON.stringify({plan,email,name:name||email}), {expirationTtl:3600});

      if (mode === 'remittance' || !phone) {
        const checkoutRes = await fetch(`${API_BASE}/azampay/postcheckout`, {
          method:'POST',
          headers:{'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'},
          body: JSON.stringify({
            amount: String(amountTZS), currencyCode: 'TZS', merchantAccountNumber: env.AZAMPAY_MERCHANT_ACCOUNT || '',
            merchantName: 'Mkude', merchantMobileNumber: env.AZAMPAY_MERCHANT_PHONE || '', provider: 'Halopesa',
            externalId: ref, additionalProperties: { email, plan, customerName: name||email },
          }),
        });
        const checkout = await checkoutRes.json();
        const checkoutUrl = checkout.data?.checkoutUrl || checkout.checkoutUrl || checkout.data?.redirectUrl;
        if (!checkoutUrl) throw new Error('AzamPay checkout link failed');
        return jsonResponse({ success:true, checkoutUrl, ref, amount:amountTZS, currency:'TZS' }, 200, env);
      }

      const mnoRes = await fetch(`${API_BASE}/azampay/mno/checkout`, {
        method:'POST',
        headers:{'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'},
        body: JSON.stringify({
          accountNumber: phone, amount: String(amountTZS), currency: 'TZS', externalId: ref,
          provider: provider || 'Azampesa', additionalProperties: { email, plan, customerName: name||email },
        }),
      });
      const mno = await mnoRes.json();
      if (mno.success===false) throw new Error(mno.message || 'AzamPay MNO checkout failed');
      return jsonResponse({ success:true, pending:true, ref, message:`Payment prompt sent to ${phone}.` }, 200, env);
    } catch(e) {
      return errorResponse('AzamPay payment setup failed: '+e.message, 502, env);
    }
  }
}
