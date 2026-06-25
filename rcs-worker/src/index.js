/**
 * Mkude -- Cloudflare Worker v4
 * -----------------------------
 * Payments: M-Pesa (Daraja) + DPO Pay + PayPal
 * AI: Claude primary (paid) + Gemini fallback / Gemini only (promo)
 * Email: Resend
 * Admin: code management + live pricing updates
 */

const PLANS = {
  Starter: { limit: 30,  price: 300, label: '30 writing tasks',  isPaid: true  },
  Growth:  { limit: 100, price: 600, label: '100 writing tasks', isPaid: true  },
  Premium: { limit: -1,  price: 900, label: 'Unlimited',         isPaid: true  },
  Promo:   { limit: 3,   price: 0,   label: '3 writing tasks',   isPaid: false },
  Admin:   { limit: -1,  price: 0,   label: 'Unlimited',         isPaid: true  },
};

// -- CORS -------------------------------------------------
function cors(env) {
  return {
    'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
}
const jsonR = (d, s=200, env) => new Response(JSON.stringify(d), { status:s, headers:{'Content-Type':'application/json',...cors(env)} });
const errR  = (m, s=400, env) => jsonR({ success:false, error:m }, s, env);

// -- MAIN HANDLER -----------------------------------------
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(env) });
    const path = new URL(req.url).pathname;
    try {
      // Core
      if (path==='/health'               && req.method==='GET')  return handleHealth(req,env);
      if (path==='/validate'             && req.method==='POST') return handleValidate(req,env);
      if (path==='/usage'                && req.method==='GET')  return handleUsage(req,env);
      if (path==='/generate'             && req.method==='POST') return handleGenerate(req,env);
      if (path==='/claim-promo'          && req.method==='POST') return handleClaimPromo(req,env);
      if (path==='/config/pricing'       && req.method==='GET')  return handleGetPricing(req,env);
      // Campaigns (Sprint 2)
      if (path==='/api/campaigns'        && req.method==='GET')  return handleGetCampaigns(req,env);
      if (path.startsWith('/api/campaigns/') && req.method==='GET') return handleGetCampaignById(req,env);
      if (path==='/api/generate/campaign' && req.method==='POST') return handleGenerateCampaign(req,env);
      // Payments
      if (path==='/clickpesa-create'     && req.method==='POST') return handleClickPesaCreate(req,env);
      if (path==='/clickpesa-callback'   && req.method==='POST') return handleClickPesaCallback(req,env);
      if (path==='/azampay-create'       && req.method==='POST') return handleAzamPayCreate(req,env);
      if (path==='/azampay-callback'     && req.method==='POST') return handleAzamPayCallback(req,env);
      // Admin
      if (path==='/admin/codes'          && req.method==='GET')  return handleAdminCodes(req,env);
      if (path==='/admin/generate'       && req.method==='POST') return handleAdminGenerate(req,env);
      if (path==='/admin/revoke'         && req.method==='POST') return handleAdminRevoke(req,env);
      if (path==='/admin/renew'          && req.method==='POST') return handleAdminRenew(req,env);
      if (path==='/admin/pricing'        && req.method==='POST') return handleAdminPricing(req,env);
      return errR('Not found', 404, env);
    } catch(e) {
      console.error('Worker error:', e);
      return errR('Internal server error: '+e.message, 500, env);
    }
  }
};

// -- HELPERS ----------------------------------------------
const nowD     = () => new Date();
const fmtDate  = d  => d.toISOString().split('T')[0];
const addDays  = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
const daysLeft = e  => Math.ceil((new Date(e)-nowD())/86400000);
const isExp    = e  => daysLeft(e) <= 0;
const CHARS    = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(plan) {
  const pfx = plan==='Promo'?'PRMO':plan==='Growth'?'GROW':plan==='Premium'?'PREM':'RCST';
  const arr  = new Uint8Array(4); crypto.getRandomValues(arr);
  return pfx + Array.from(arr).map(b=>CHARS[b%CHARS.length]).join('');
}
function adminOk(req, env) { return req.headers.get('X-Admin-Token') === env.ADMIN_TOKEN; }
function emailDomain(e) { return e?.includes('@') ? e.split('@')[1].toLowerCase().trim() : null; }

// -- RATE LIMIT --------------------------------------------
async function rateLimit(env, key, max, ttl) {
  const k   = `rl:${key}`;
  const cur = parseInt(await env.RATELIMIT_KV.get(k)||'0');
  if (cur>=max) return false;
  await env.RATELIMIT_KV.put(k, String(cur+1), { expirationTtl:ttl });
  return true;
}

// -- VALIDATE CODE -----------------------------------------
async function validateCode(code, env) {
  if (!code || typeof code!=='string' || !/^[A-Z0-9]{4,12}$/.test(code.toUpperCase()))
    return { valid:false, error:'Invalid code format.' };
  const clean = code.toUpperCase();
  const data  = await env.CODES_KV.get(clean,'json');
  if (!data)         return { valid:false, error:'Code not found. Contact support.' };
  if (!data.active)  return { valid:false, error:'Code deactivated. Please renew.' };
  if (isExp(data.expiry)) return { valid:false, error:`Code expired on ${data.expiry}. Please renew.` };
  return { valid:true, code:clean, data };
}

// -- /health -----------------------------------------------
async function handleHealth(req, env) {
  return jsonR({ status:'ok', ts:Date.now(), version:'5.0', payments:['clickpesa','azampay'] }, 200, env);
}

// -- /validate ---------------------------------------------
async function handleValidate(req, env) {
  const { code } = await req.json().catch(()=>({}));
  const v = await validateCode(code, env);
  if (!v.valid) return errR(v.error, 401, env);
  const { data } = v;
  const limit = PLANS[data.plan]?.limit ?? 30;
  const used  = data.used || 0;
  return jsonR({
    success:true, plan:data.plan, client:data.client, email:data.email||'',
    expiry:data.expiry, daysLeft:daysLeft(data.expiry),
    used, limit, remaining: limit===-1 ? -1 : Math.max(0,limit-used),
    isPaid: PLANS[data.plan]?.isPaid ?? false,
  }, 200, env);
}

// -- /usage ------------------------------------------------
async function handleUsage(req, env) {
  const code = req.headers.get('X-Access-Code');
  const v    = await validateCode(code, env);
  if (!v.valid) return errR(v.error, 401, env);
  const { data } = v;
  const limit = PLANS[data.plan]?.limit ?? 30;
  const used  = data.used || 0;
  return jsonR({ used, limit, remaining: limit===-1 ? -1 : Math.max(0,limit-used) }, 200, env);
}

// -- /generate ---------------------------------------------
async function handleGenerate(req, env) {
  const ip   = req.headers.get('CF-Connecting-IP')||'unknown';
  const body = await req.json().catch(()=>null);
  if (!body?.prompt) return errR('Missing prompt.', 400, env);
  const { prompt, code } = body;
  const v = await validateCode(code, env);
  if (!v.valid) return errR(v.error, 401, env);
  const { data:cd } = v;
  const limit  = PLANS[cd.plan]?.limit ?? 30;
  const isPaid = PLANS[cd.plan]?.isPaid ?? false;
  if (limit!==-1 && (cd.used||0)>=limit)
    return errR('Monthly limit reached. Please upgrade your plan.', 429, env);
  const [okCode,okIP] = await Promise.all([
    rateLimit(env,`code:${code}:${Math.floor(Date.now()/60000)}`,10,120),
    rateLimit(env,`ip:${ip}:${Math.floor(Date.now()/60000)}`,20,120),
  ]);
  if (!okCode) return errR('Too many requests. Please wait a moment.', 429, env);
  if (!okIP)   return errR('Too many requests from your network.', 429, env);
  if (typeof prompt!=='string'||prompt.length>2000) return errR('Invalid prompt.', 400, env);
  const safe = prompt.trim().slice(0,2000);
  let text='', source='';
  // Paid: Claude primary -> Gemini fallback. Promo: Gemini only.
  if (isPaid && env.ANTHROPIC_KEY) {
    try { text=await callClaude(safe,env.ANTHROPIC_KEY); source='claude'; }
    catch(e) { console.warn('Claude failed:',e.message); }
  }
  if (!text && env.GEMINI_KEY) {
    try { text=await callGemini(safe,env.GEMINI_KEY); source='gemini'; }
    catch(e) { console.warn('Gemini failed:',e.message); }
  }
  if (!text) return errR('Writing service temporarily unavailable. Please try again shortly.', 503, env);
  cd.used = (cd.used||0)+1;
  await env.CODES_KV.put(code, JSON.stringify(cd));
  return jsonR({ success:true, text, source, isPaid }, 200, env);
}

// -- AI CALLERS --------------------------------------------
async function callClaude(prompt, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:600,messages:[{role:'user',content:prompt}]})
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||'Claude '+res.status); }
  const d = await res.json();
  return d.content.map(b=>b.text||'').join('').trim();
}
async function callGemini(prompt, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${key}`;
  const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:600,temperature:0.7}})});
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||'Gemini '+res.status); }
  const d = await res.json();
  return d.candidates[0].content.parts[0].text.trim();
}

// == PROMO CLAIM ===========================================
async function handleClaimPromo(req, env) {
  const { email, name, deviceId } = await req.json().catch(()=>({}));
  const ip = req.headers.get('CF-Connecting-IP')||'unknown';
  if (!email||!email.includes('@')) return errR('Valid email required.', 400, env);
  if (!name||name.trim().length<2)  return errR('Name is required.', 400, env);
  if (!deviceId) return errR('Device verification required.', 400, env);
  const normEmail  = email.toLowerCase().trim();
  const domain     = emailDomain(email);
  const normDevice = deviceId.trim().toLowerCase();
  const BLOCKED_DOMAINS=['mailinator.com','guerrillamail.com','tempmail.com','10minutemail.com','throwam.com','yopmail.com','trashmail.com','sharklasers.com','spam4.me','fakeinbox.com'];
  if (BLOCKED_DOMAINS.includes(domain)) return errR('Disposable email addresses are not permitted for free trials.', 400, env);
  const PUBLIC_DOMAINS=['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','protonmail.com','live.com','msn.com','me.com','mac.com'];
  const [emailUsed,deviceUsed,ipUsed] = await Promise.all([
    env.RATELIMIT_KV.get(`promo:email:${normEmail}`),
    env.RATELIMIT_KV.get(`promo:device:${normDevice}`),
    env.RATELIMIT_KV.get(`promo:ip:${ip}`),
  ]);
  if (emailUsed)  return errR('A free trial has already been used with this email address.', 409, env);
  if (deviceUsed) return errR('A free trial has already been used on this device. Please subscribe to continue.', 409, env);
  if (ipUsed)     return errR('A free trial has recently been claimed from your network. Please subscribe to continue.', 409, env);
  if (!PUBLIC_DOMAINS.includes(domain)) {
    const domainUsed = await env.RATELIMIT_KV.get(`promo:domain:${domain}`);
    if (domainUsed) return errR('A free trial has already been used for this organisation. Please subscribe to continue.', 409, env);
  }
  // Get promo config from KV (allows admin to update limits)
  const pricingCfg = await env.CODES_KV.get('config:pricing','json');
  const promoLimit = pricingCfg?.Promo?.limit ?? 3;
  const promoDays  = pricingCfg?.Promo?.days  ?? 7;
  const code   = makeCode('Promo');
  const expiry = fmtDate(addDays(nowD(), promoDays));
  await env.CODES_KV.put(code, JSON.stringify({
    plan:'Promo', client:name.trim(), email:normEmail, deviceId:normDevice,
    expiry, active:true, used:0, limit:promoLimit, created:fmtDate(nowD()), ip
  }));
  const TTL = 365*86400;
  await Promise.all([
    env.RATELIMIT_KV.put(`promo:email:${normEmail}`,  code, {expirationTtl:TTL}),
    env.RATELIMIT_KV.put(`promo:device:${normDevice}`,code, {expirationTtl:TTL}),
    env.RATELIMIT_KV.put(`promo:ip:${ip}`,            code, {expirationTtl:7*86400}),
    !PUBLIC_DOMAINS.includes(domain) ? env.RATELIMIT_KV.put(`promo:domain:${domain}`,code,{expirationTtl:TTL}) : Promise.resolve(),
  ]);
  await sendAccessCodeEmail({email:normEmail,name:name.trim(),code,plan:'Promo',expiry,limit:`${promoLimit} writing tasks (free trial)`},env).catch(e=>console.warn('Promo email failed:',e));
  return jsonR({ success:true, code, expiry, limit:promoLimit }, 200, env);
}

// == PRICING (public read) ==================================
// Returns current live pricing so frontend can sync across devices.
async function handleGetPricing(req, env) {
  const cfg = await env.CODES_KV.get('config:pricing','json');
  const pricing = cfg || {
    Starter:{usd:3,  tzs:7500, kes:400, limit:30,  days:30},
    Growth: {usd:6,  tzs:15000,kes:800, limit:100, days:30},
    Premium:{usd:9,  tzs:22500,kes:1200,limit:-1,  days:30},
    Promo:  {usd:0,  tzs:0,    kes:0,   limit:3,   days:7 },
  };
  return jsonR({ success:true, pricing }, 200, env);
}

// == CAMPAIGNS (Sprint 2) ==================================
async function handleGetCampaigns(req, env) {
  const code = req.headers.get('X-Access-Code');
  const v = await validateCode(code, env);
  if (!v.valid) return errR(v.error, 401, env);

  const prefix = `campaign:${v.code}:`;
  const list = await env.CODES_KV.list({ prefix });
  const campaigns = [];
  for (const key of list.keys) {
    const data = await env.CODES_KV.get(key.name, 'json');
    if (data) {
      // For list view, we might not want the full output to save bandwidth
      const { output, ...summary } = data;
      campaigns.push(summary);
    }
  }
  // Sort by created_at desc
  campaigns.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  return jsonR({ success:true, campaigns }, 200, env);
}

async function handleGetCampaignById(req, env) {
  const code = req.headers.get('X-Access-Code');
  const v = await validateCode(code, env);
  if (!v.valid) return errR(v.error, 401, env);

  const id = new URL(req.url).pathname.split('/').pop();
  if (!id) return errR('Missing campaign ID', 400, env);

  const data = await env.CODES_KV.get(`campaign:${v.code}:${id}`, 'json');
  if (!data) return errR('Campaign not found', 404, env);

  return jsonR({ success:true, campaign: data }, 200, env);
}

async function handleGenerateCampaign(req, env) {
  const code = req.headers.get('X-Access-Code');
  const body = await req.json().catch(()=>({}));
  const v = await validateCode(code || body.code, env);
  if (!v.valid) return errR(v.error, 401, env);

  const { business_type, promotion_name, promotion_description, offer, target_audience, campaign_goal } = body;
  if (!promotion_name || !promotion_description) return errR('Promotion name and description are required.', 400, env);

  // Check usage limit
  const { data:cd } = v;
  const limit  = PLANS[cd.plan]?.limit ?? 30;
  if (limit!==-1 && (cd.used||0)>=limit)
    return errR('Monthly limit reached. Please upgrade your plan.', 429, env);

  const prompt = `You are a Hospitality Campaign Strategist, Social Media Expert, Email Marketing Specialist, and Calendar Builder.
Create a complete multi-channel marketing campaign for a ${business_type || 'hospitality business'}.

Input Details:
- Promotion Name: ${promotion_name}
- Promotion Description: ${promotion_description}
- Offer: ${offer || 'N/A'}
- Target Audience: ${target_audience || 'General hospitality guests'}
- Campaign Goal: ${campaign_goal || 'Increase bookings/visits'}

Requirements:
1. Campaign Brief: Theme, Key Message, Target Audience, Marketing Angle, CTA.
2. Social Media Posts: Instagram Caption, Facebook Post, LinkedIn Post (Hospitality tone, include CTA).
3. Email Campaign: Subject Line, Preview Text, Email Body, CTA.
4. 30-Day Content Calendar: A list of 30 entries with Date (Day 1 to Day 30), Platform, Topic, Content Type, CTA.

Output: Return ONLY a valid JSON object with the following structure:
{
  "campaign_brief": { "theme": "", "key_message": "", "target_audience": "", "marketing_angle": "", "cta": "" },
  "social_media": { "instagram": "", "facebook": "", "linkedin": "" },
  "email_campaign": { "subject": "", "preview": "", "body": "", "cta": "" },
  "calendar": [ { "day": 1, "platform": "", "topic": "", "content_type": "", "cta": "" }, ... ]
}

Ensure the tone is professional, evocative, and aligned with hospitality standards. Write in English.`;

  let text = '', source = '';
  const isPaid = PLANS[cd.plan]?.isPaid ?? false;

  if (isPaid && env.ANTHROPIC_KEY) {
    try { text = await callClaude(prompt, env.ANTHROPIC_KEY); source = 'claude'; }
    catch (e) { console.warn('Claude failed:', e.message); }
  }
  if (!text && env.GEMINI_KEY) {
    try { text = await callGemini(prompt, env.GEMINI_KEY); source = 'gemini'; }
    catch (e) { console.warn('Gemini failed:', e.message); }
  }

  if (!text) return errR('Generation service unavailable.', 503, env);

  try {
    // Basic JSON cleanup if needed
    const cleanJson = text.includes('```json') ? text.split('```json')[1].split('```')[0].trim() : text.trim();
    const campaignData = JSON.parse(cleanJson);

    // Save campaign (Persistence logic will be refined in the next step)
    const campaignId = Date.now().toString();
    const campaign = {
      id: campaignId,
      code: v.code,
      name: promotion_name,
      input: body,
      output: campaignData,
      created_at: nowD().toISOString()
    };

    await env.CODES_KV.put(`campaign:${v.code}:${campaignId}`, JSON.stringify(campaign));

    // Increment usage
    cd.used = (cd.used || 0) + 1;
    await env.CODES_KV.put(v.code, JSON.stringify(cd));

    return jsonR({ success: true, campaign, source }, 200, env);
  } catch (e) {
    console.error('JSON Parse Error:', e, text);
    return errR('AI returned invalid JSON. Please try again.', 500, env);
  }
}

// == CLICKPESA =============================================
// ClickPesa Checkout: generate a checkout link covering mobile money
// (M-Pesa, Mixx by Yas/Tigo Pesa, Airtel Money, HaloPesa) and cards.
// Docs: https://docs.clickpesa.com
async function handleClickPesaCreate(req, env) {
  const { plan, email, name, phone } = await req.json().catch(()=>({}));
  if (!plan||!PLANS[plan]?.isPaid) return errR('Invalid plan.', 400, env);
  if (!email) return errR('Email required.', 400, env);
  if (!env.CLICKPESA_API_KEY || !env.CLICKPESA_CLIENT_ID) {
    return errR('ClickPesa not configured. Contact support.', 503, env);
  }
  const ip = req.headers.get('CF-Connecting-IP')||'unknown';
  const okIP = await rateLimit(env,`clickpesa:${ip}:${Math.floor(Date.now()/3600000)}`,5,3600);
  if (!okIP) return errR('Too many payment attempts. Please try again later.', 429, env);

  // Load live pricing (TZS amount for local checkout)
  const pricingCfg = await env.CODES_KV.get('config:pricing','json');
  const planPricing = pricingCfg?.[plan];
  const amountTZS = planPricing?.tzs ?? ({Starter:7500,Growth:15000,Premium:22500}[plan]);
  const ref = `MKUDE_${plan}_${Date.now()}`;

  try {
    // 1. Get auth token
    const tokenRes = await fetch('https://api.clickpesa.com/third-parties/generate-token', {
      method:'POST',
      headers:{
        'client-id':     env.CLICKPESA_CLIENT_ID,
        'api-key':       env.CLICKPESA_API_KEY,
        'Content-Type':  'application/json',
      },
    });
    if (!tokenRes.ok) throw new Error('ClickPesa auth failed ('+tokenRes.status+')');
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.token || tokenData.access_token;
    if (!accessToken) throw new Error('ClickPesa did not return an access token');

    // 2. Create checkout link
    const checkoutRes = await fetch('https://api.clickpesa.com/third-parties/payments/checkout-link', {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        amount:       String(amountTZS),
        currency:     'TZS',
        orderReference: ref,
        customerEmail: email,
        customerName:  name || email,
        customerPhoneNumber: phone || undefined,
        webhookURL:    `${env.WORKER_PUBLIC_URL || ''}/clickpesa-callback`,
        redirectURL:   `${env.ALLOWED_ORIGIN || 'https://mkude.com'}/?clickpesa=success`,
      }),
    });
    if (!checkoutRes.ok) {
      const errBody = await checkoutRes.text();
      throw new Error('ClickPesa checkout link failed: '+errBody.slice(0,200));
    }
    const checkout = await checkoutRes.json();
    const checkoutUrl = checkout.checkoutUrl || checkout.url || checkout.link;
    if (!checkoutUrl) throw new Error('ClickPesa did not return a checkout URL');

    // 3. Store pending payment for callback matching
    await env.CODES_KV.put(`pending:clickpesa:${ref}`, JSON.stringify({plan,email,name:name||email}), {expirationTtl:3600});

    return jsonR({ success:true, checkoutUrl, ref, amount:amountTZS, currency:'TZS' }, 200, env);
  } catch(e) {
    console.error('ClickPesa create error:', e);
    return errR('ClickPesa payment setup failed: '+e.message, 502, env);
  }
}

// ClickPesa webhook -- fired on successful payment.
// Verify with checksum/IP allowlist per ClickPesa docs before trusting payload.
async function handleClickPesaCallback(req, env) {
  try {
    const body = await req.json().catch(()=>({}));
    // ClickPesa sends orderReference and status in the webhook payload
    const ref    = body.orderReference || body.reference || body.data?.orderReference;
    const status = (body.status || body.data?.status || '').toUpperCase();
    if (!ref) return jsonR({ok:true}, 200, env);

    // Optional checksum verification if configured
    if (env.CLICKPESA_CHECKSUM_SECRET && body.checksum) {
      const expected = await hmacHex(env.CLICKPESA_CHECKSUM_SECRET, JSON.stringify(body.data||body));
      if (expected !== body.checksum) {
        console.warn('ClickPesa checksum mismatch for', ref);
        return jsonR({ok:true}, 200, env);
      }
    }

    if (!['SUCCESS','SUCCESSFUL','COMPLETED','PAID'].includes(status)) {
      return jsonR({ok:true}, 200, env);
    }

    const idempKey = `clickpesa:paid:${ref}`;
    if (await env.CODES_KV.get(idempKey)) return jsonR({ok:true}, 200, env);

    const pending = await env.CODES_KV.get(`pending:clickpesa:${ref}`,'json');
    if (!pending) return jsonR({ok:true}, 200, env);

    const code   = makeCode(pending.plan);
    const expiry = fmtDate(addDays(nowD(),30));
    await env.CODES_KV.put(code, JSON.stringify({
      plan:pending.plan, client:pending.name, email:pending.email, expiry,
      active:true, used:0, limit:PLANS[pending.plan].limit, created:fmtDate(nowD()), paidVia:'clickpesa',
    }));
    await env.CODES_KV.put(idempKey, `"${code}"`, {expirationTtl:86400});
    await env.CODES_KV.delete(`pending:clickpesa:${ref}`).catch(()=>{});
    await sendAccessCodeEmail({email:pending.email,name:pending.name,code,plan:pending.plan,expiry,limit:PLANS[pending.plan].label}, env);

    console.log('ClickPesa payment success -- code:', code, 'for', pending.email);
    return jsonR({ok:true,code}, 200, env);
  } catch(e) {
    console.error('ClickPesa callback error:', e);
    return jsonR({ok:true}, 200, env);
  }
}

// == AZAMPAY ===============================================
// AzamPay Lipia Link / MNO checkout: local mobile money (AzamPesa,
// Tigo Pesa/Mixx, HaloPesa, Airtel Money) and international remittance.
// Docs: https://github.com/flexcodelabs/azampay
async function handleAzamPayCreate(req, env) {
  const { plan, email, name, phone, provider, mode } = await req.json().catch(()=>({}));
  if (!plan||!PLANS[plan]?.isPaid) return errR('Invalid plan.', 400, env);
  if (!email) return errR('Email required.', 400, env);
  if (!env.AZAMPAY_CLIENT_ID || !env.AZAMPAY_CLIENT_SECRET || !env.AZAMPAY_APP_NAME) {
    return errR('AzamPay not configured. Contact support.', 503, env);
  }
  const ip = req.headers.get('CF-Connecting-IP')||'unknown';
  const okIP = await rateLimit(env,`azampay:${ip}:${Math.floor(Date.now()/3600000)}`,5,3600);
  if (!okIP) return errR('Too many payment attempts. Please try again later.', 429, env);

  const pricingCfg  = await env.CODES_KV.get('config:pricing','json');
  const planPricing = pricingCfg?.[plan];
  const amountTZS   = planPricing?.tzs ?? ({Starter:7500,Growth:15000,Premium:22500}[plan]);
  const ref = `MKUDE_${plan}_${Date.now()}`;
  const AUTH_BASE = env.AZAMPAY_SANDBOX==='true'
    ? 'https://authenticator-sandbox.azampay.co.tz'
    : 'https://authenticator.azampay.co.tz';
  const API_BASE  = env.AZAMPAY_SANDBOX==='true'
    ? 'https://sandbox.azampay.co.tz'
    : 'https://checkout.azampay.co.tz';

  try {
    // 1. Get access token
    const tokenRes = await fetch(`${AUTH_BASE}/AppRegistration/GenerateToken`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        appName:      env.AZAMPAY_APP_NAME,
        clientId:     env.AZAMPAY_CLIENT_ID,
        clientSecret: env.AZAMPAY_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) throw new Error('AzamPay auth failed ('+tokenRes.status+')');
    const tokenData  = await tokenRes.json();
    const accessToken = tokenData.data?.accessToken || tokenData.accessToken;
    if (!accessToken) throw new Error('AzamPay did not return an access token');

    await env.CODES_KV.put(`pending:azampay:${ref}`, JSON.stringify({plan,email,name:name||email}), {expirationTtl:3600});

    if (mode === 'remittance' || !phone) {
      // International / remittance: use Post Checkout to get a hosted payment link
      const checkoutRes = await fetch(`${API_BASE}/azampay/postcheckout`, {
        method:'POST',
        headers:{'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'},
        body: JSON.stringify({
          amount:        String(amountTZS),
          currencyCode:  'TZS',
          merchantAccountNumber: env.AZAMPAY_MERCHANT_ACCOUNT || '',
          merchantName:  'Mkude',
          merchantMobileNumber: env.AZAMPAY_MERCHANT_PHONE || '',
          provider:      'Halopesa',
          externalId:    ref,
          additionalProperties: { email, plan, customerName: name||email },
        }),
      });
      const checkout = await checkoutRes.json().catch(()=>({}));
      const checkoutUrl = checkout.data?.checkoutUrl || checkout.checkoutUrl || checkout.data?.redirectUrl;
      if (!checkoutUrl) throw new Error('AzamPay did not return a checkout URL: '+JSON.stringify(checkout).slice(0,200));
      return jsonR({ success:true, checkoutUrl, ref, amount:amountTZS, currency:'TZS' }, 200, env);
    }

    // Local mobile money: MNO checkout (USSD push to customer phone)
    const mnoRes = await fetch(`${API_BASE}/azampay/mno/checkout`, {
      method:'POST',
      headers:{'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'},
      body: JSON.stringify({
        accountNumber: phone,
        amount:        String(amountTZS),
        currency:      'TZS',
        externalId:    ref,
        provider:      provider || 'Azampesa', // Azampesa | Mpesa | Tigo | Airtel | Halopesa
        additionalProperties: { email, plan, customerName: name||email },
      }),
    });
    const mno = await mnoRes.json().catch(()=>({}));
    if (mno.success===false || mnoRes.status>=400) {
      throw new Error(mno.message || 'AzamPay MNO checkout failed');
    }
    return jsonR({ success:true, pending:true, ref, message:`Payment prompt sent to ${phone}. Please enter your PIN.` }, 200, env);
  } catch(e) {
    console.error('AzamPay create error:', e);
    return errR('AzamPay payment setup failed: '+e.message, 502, env);
  }
}

// AzamPay webhook -- fired on transaction completion (MNO or checkout).
async function handleAzamPayCallback(req, env) {
  try {
    const body = await req.json().catch(()=>({}));
    const ref    = body.externalId || body.externalreferenceid || body.reference || body.data?.externalId;
    const status = (body.transactionstatus || body.status || body.data?.status || '').toString().toUpperCase();
    if (!ref) return jsonR({ok:true}, 200, env);

    if (!['SUCCESS','SUCCESSFUL','COMPLETED'].includes(status)) {
      return jsonR({ok:true}, 200, env);
    }

    const idempKey = `azampay:paid:${ref}`;
    if (await env.CODES_KV.get(idempKey)) return jsonR({ok:true}, 200, env);

    const pending = await env.CODES_KV.get(`pending:azampay:${ref}`,'json');
    if (!pending) return jsonR({ok:true}, 200, env);

    const code   = makeCode(pending.plan);
    const expiry = fmtDate(addDays(nowD(),30));
    await env.CODES_KV.put(code, JSON.stringify({
      plan:pending.plan, client:pending.name, email:pending.email, expiry,
      active:true, used:0, limit:PLANS[pending.plan].limit, created:fmtDate(nowD()), paidVia:'azampay',
    }));
    await env.CODES_KV.put(idempKey, `"${code}"`, {expirationTtl:86400});
    await env.CODES_KV.delete(`pending:azampay:${ref}`).catch(()=>{});
    await sendAccessCodeEmail({email:pending.email,name:pending.name,code,plan:pending.plan,expiry,limit:PLANS[pending.plan].label}, env);

    console.log('AzamPay payment success -- code:', code, 'for', pending.email);
    return jsonR({ok:true,code}, 200, env);
  } catch(e) {
    console.error('AzamPay callback error:', e);
    return jsonR({ok:true}, 200, env);
  }
}

// HMAC-SHA256 hex helper (for ClickPesa checksum verification)
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// == EMAIL ================================================
async function sendAccessCodeEmail({ email, name, code, plan, expiry, limit }, env) {
  if (!env.RESEND_API_KEY) { console.warn('RESEND_API_KEY not set. Code:',code); return; }
  const isPromo  = plan==='Promo';
  const subject  = isPromo ? '🎁 Your Mkude Free Trial Code' : `🔑 Your Mkude Access Code -- ${plan} Plan`;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;background:#f9f7f4;margin:0;padding:0;}
.wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e2dd;}
.hdr{background:${isPromo?'#1a6b4a':'#0d0d0d'};padding:2rem;text-align:center;}
.logo{font-family:Georgia,serif;font-size:24px;font-weight:700;color:#fff;}
.logo span{color:#c9a84c;}
.body{padding:2rem;}
.code-box{background:#f9f7f4;border:2px dashed #c9a84c;border-radius:12px;padding:1.5rem;text-align:center;margin:1.25rem 0;}
.code-val{font-family:monospace;font-size:26px;font-weight:700;letter-spacing:.2em;color:#0d0d0d;}
.plan-box{background:#f0fdf4;border:1px solid rgba(26,107,74,.2);border-radius:10px;padding:1rem 1.25rem;margin:1rem 0;font-size:13px;color:#166534;}
.btn{display:inline-block;background:#1a6b4a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:99px;font-size:14px;font-weight:700;}
.footer{background:#f9f7f4;padding:1.25rem;text-align:center;font-size:11px;color:#9ca3af;}
</style></head><body>
<div class="wrap">
  <div class="hdr"><div class="logo">👨‍🍳 Mkude</div>
    <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">Your Restaurant Content Team Member</div>
  </div>
  <div class="body">
    <p style="font-size:16px;margin-bottom:1rem;">Hi ${name} 👋</p>
    <p style="font-size:14px;color:#6b7280;line-height:1.7;margin-bottom:1.25rem;">
      ${isPromo
        ? 'Welcome to your free trial! I have <strong>3 writing tasks</strong> ready for you. No credit card required.'
        : 'Your payment was successful. Your access code is ready -- enter it on the site to start immediately.'}
    </p>
    <div class="code-box">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:.5rem;">${isPromo?'FREE TRIAL CODE':'YOUR ACCESS CODE'}</p>
      <p class="code-val">${code}</p>
    </div>
    <div class="plan-box">
      <div style="display:flex;justify-content:space-between;padding:3px 0;"><span><strong>Plan</strong></span><span>${plan}${isPromo?' (Free Trial)':''}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;"><span><strong>Writing tasks</strong></span><span>${limit}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;"><span><strong>Expires</strong></span><span>${expiry}</span></div>
    </div>
    ${isPromo?'<p style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:.875rem;font-size:12px;color:#92400e;margin:1rem 0;">⚠️ Free trial is limited to 3 writing tasks and expires in 7 days. One trial per email address and device.</p>':''}
    <div style="text-align:center;margin:1.5rem 0;">
      <a class="btn" href="https://mkude.com">🚀 Open Mkude Now</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e5e2dd;">
      Keep this email -- your code is <strong>${code}</strong>.<br>
      Support: <a href="mailto:support@mkude.com" style="color:#1a6b4a;">support@mkude.com</a> ·
      <a href="https://wa.me/255768777057" style="color:#1a6b4a;">WhatsApp 0768 777 057</a>
    </p>
  </div>
  <div class="footer">© 2026 Lefking Enterprise (T) Limited · Dar es Salaam, Tanzania<br>
    Powered by Mkude -- Your Restaurant Content Team Member</div>
</div></body></html>`;
  const res = await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:'Mkude <no-reply@mkude.com>',to:[email],subject,html,tags:[{name:'plan',value:plan}]})
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); console.error('Resend failed:',e); }
  else console.log('Email sent to',email);
}

// == ADMIN ROUTES ==========================================
async function handleAdminCodes(req, env) {
  if (!adminOk(req,env)) return errR('Unauthorised',401,env);
  const list  = await env.CODES_KV.list();
  const codes = {};
  await Promise.all(list.keys.map(async k=>{
    if (k.name.startsWith('rl:')||k.name.startsWith('pending:')||k.name.startsWith('mpesa:')||
        k.name.startsWith('dpo:')||k.name.startsWith('pp:')||k.name.startsWith('promo:')||
        k.name.startsWith('config:')) return;
    const d = await env.CODES_KV.get(k.name,'json');
    if (d) codes[k.name]=d;
  }));
  const all      = Object.entries(codes).filter(([,d])=>d.plan!=='Admin');
  const rev      = {Starter:3,Growth:6,Premium:9,Promo:0};
  const mrr      = all.filter(([,d])=>d.active&&!isExp(d.expiry)).reduce((s,[,d])=>s+(rev[d.plan]||0),0);
  const totalGen = all.reduce((s,[,d])=>s+(d.used||0),0);
  return jsonR({codes,stats:{total:all.length,mrr,totalGen}},200,env);
}

async function handleAdminGenerate(req, env) {
  if (!adminOk(req,env)) return errR('Unauthorised',401,env);
  const { plan, client, days, email } = await req.json().catch(()=>({}));
  if (!plan||!PLANS[plan]) return errR('Invalid plan.',400,env);
  if (!client)             return errR('Client name required.',400,env);
  const code   = makeCode(plan);
  const expiry = fmtDate(addDays(nowD(),Math.min(parseInt(days)||30,365)));
  const data   = {plan,client:client.slice(0,60),email:(email||'').toLowerCase().trim(),expiry,active:true,used:0,limit:PLANS[plan].limit,created:fmtDate(nowD())};
  await env.CODES_KV.put(code,JSON.stringify(data));
  if (email) await sendAccessCodeEmail({email,name:client,code,plan,expiry,limit:PLANS[plan].label},env).catch(e=>console.warn('Email failed:',e));
  return jsonR({success:true,code,plan,client,expiry,limit:PLANS[plan].limit===-1?'Unlimited':PLANS[plan].limit},200,env);
}

async function handleAdminRevoke(req, env) {
  if (!adminOk(req,env)) return errR('Unauthorised',401,env);
  const { code } = await req.json().catch(()=>({}));
  if (!code) return errR('Code required.',400,env);
  const d = await env.CODES_KV.get(code.toUpperCase(),'json');
  if (!d)  return errR('Code not found.',404,env);
  d.active=false;
  await env.CODES_KV.put(code.toUpperCase(),JSON.stringify(d));
  return jsonR({success:true,message:`${code} deactivated.`},200,env);
}

async function handleAdminRenew(req, env) {
  if (!adminOk(req,env)) return errR('Unauthorised',401,env);
  const { code, days } = await req.json().catch(()=>({}));
  if (!code) return errR('Code required.',400,env);
  const d = await env.CODES_KV.get(code.toUpperCase(),'json');
  if (!d)  return errR('Code not found.',404,env);
  d.expiry = fmtDate(addDays(nowD(),Math.min(parseInt(days)||30,365)));
  d.active = true; d.used=0;
  await env.CODES_KV.put(code.toUpperCase(),JSON.stringify(d));
  if (d.email) await sendAccessCodeEmail({email:d.email,name:d.client,code:code.toUpperCase(),plan:d.plan,expiry:d.expiry,limit:PLANS[d.plan]?.label||''},env).catch(()=>{});
  return jsonR({success:true,message:`${code} renewed.`,newExpiry:d.expiry},200,env);
}

async function handleAdminPricing(req, env) {
  if (!adminOk(req,env)) return errR('Unauthorised',401,env);
  const pricing = await req.json().catch(()=>null);
  if (!pricing) return errR('Invalid pricing data.',400,env);
  const required=['Starter','Growth','Premium','Promo'];
  for (const p of required) {
    if (!pricing[p]) return errR(`Missing plan: ${p}`,400,env);
    if (typeof pricing[p].usd!=='number') return errR(`Invalid USD price for ${p}`,400,env);
  }
  await env.CODES_KV.put('config:pricing',JSON.stringify(pricing));
  return jsonR({success:true,message:'Pricing updated successfully.'},200,env);
}
