/**
 * Mkude -- Cloudflare Worker v6
 * -----------------------------
 * Payments: ClickPesa (local mobile money: M-Pesa, Mixx by Yas/Tigo Pesa,
 *           Airtel Money, HaloPesa + Visa/Mastercard via Hosted Checkout)
 * AI: Claude primary (paid) + Gemini fallback / Gemini only (promo)
 * Email: Resend
 * Admin: code management + live pricing updates
 * Note: AzamPay removed pending KYC approval -- will be re-added in v7
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
      // Payments
      if (path==='/clickpesa-create'     && req.method==='POST') return handleClickPesaCreate(req,env);
      if (path==='/clickpesa-callback'   && req.method==='POST') return handleClickPesaCallback(req,env);
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
  return jsonR({ status:'ok', ts:Date.now(), version:'6.0', payments:['clickpesa'] }, 200, env);
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
  if (typeof prompt!=='string'||prompt.length>6000) return errR('Invalid prompt.', 400, env);
  const safe = prompt.trim().slice(0,6000);
  // Premium/Admin get higher token budget for the 7-loop Marketing OS
  const isPremiumPlan = cd.plan==='Premium' || cd.plan==='Admin';
  if (body.premium && !isPremiumPlan) {
    return errR('Marketing OS is available on the Premium plan only. Upgrade to access.', 403, env);
  }
  const maxTok = body.premium && isPremiumPlan ? 1800 : 600;
  let text='', source='';
  // Paid: Claude primary -> Gemini fallback. Promo: Gemini only.
  if (isPaid && env.ANTHROPIC_KEY) {
    try { text=await callClaude(safe,env.ANTHROPIC_KEY,maxTok); source='claude'; }
    catch(e) { console.warn('Claude failed:',e.message); }
  }
  if (!text && env.GEMINI_KEY) {
    try { text=await callGemini(safe,env.GEMINI_KEY,maxTok); source='gemini'; }
    catch(e) { console.warn('Gemini failed:',e.message); }
  }
  if (!text) return errR('Writing service temporarily unavailable. Please try again shortly.', 503, env);
  cd.used = (cd.used||0)+1;
  await env.CODES_KV.put(code, JSON.stringify(cd));
  return jsonR({ success:true, text, source, isPaid }, 200, env);
}

// -- AI CALLERS --------------------------------------------
async function callClaude(prompt, key, maxTok=600) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:maxTok,messages:[{role:'user',content:prompt}]})
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||'Claude '+res.status); }
  const d = await res.json();
  return d.content.map(b=>b.text||'').join('').trim();
}
async function callGemini(prompt, key, maxTok=600) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`;
  const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:maxTok,temperature:0.7}})});
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||'Gemini '+res.status); }
  const d = await res.json();
  const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = d?.candidates?.[0]?.finishReason || 'unknown';
    throw new Error('Gemini returned no content (reason: '+reason+')');
  }
  return text.trim();
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

// == CLICKPESA =============================================
// ClickPesa Hosted Checkout: generates a checkout link covering mobile
// money (M-Pesa, Mixx by Yas/Tigo Pesa, Airtel Money, HaloPesa) and cards.
// Verified against https://docs.clickpesa.com (Generate Authorization
// Token + Generate Checkout Link, Hosted Checkout product).
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
  // ClickPesa order references must be alphanumeric only (no underscores/dashes)
  const ref = `MKUDE${plan}${Date.now()}`.replace(/[^A-Za-z0-9]/g,'');

  try {
    // 1. Generate auth token -- POST /third-parties/generate-token
    //    with client-id and api-key as HEADERS (not body).
    const tokenRes = await fetch('https://api.clickpesa.com/third-parties/generate-token', {
      method:'POST',
      headers:{
        'client-id':    env.CLICKPESA_CLIENT_ID,
        'api-key':      env.CLICKPESA_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const tokenData = await tokenRes.json().catch(()=>({}));
    if (!tokenRes.ok || !tokenData.success) {
      throw new Error(tokenData.message || 'ClickPesa auth failed ('+tokenRes.status+')');
    }
    // tokenData.token already includes the "Bearer " prefix per ClickPesa docs.
    let authHeader = tokenData.token;
    if (!authHeader) throw new Error('ClickPesa did not return a token');
    if (!authHeader.toLowerCase().startsWith('bearer ')) authHeader = 'Bearer '+authHeader;

    // 2. Generate checkout link -- POST /third-parties/checkout-link/generate-checkout-url
    //    Body uses totalPrice / orderReference / orderCurrency / customerXxx.
    const checkoutBody = {
      totalPrice:    String(amountTZS),
      orderReference: ref,
      orderCurrency: 'TZS',
      customerName:  name || email,
      customerEmail: email,
      description:   `Mkude ${plan} Plan -- 30 days restaurant content access`,
    };
    if (phone) checkoutBody.customerPhone = phone.replace(/^\+/,'');
    if (env.WORKER_PUBLIC_URL) checkoutBody.callbackUrl = `${env.WORKER_PUBLIC_URL}/clickpesa-callback`;

    // ClickPesa application has checksum verification enabled -- every
    // request body must include a checksum computed over the OTHER fields
    // (checksum/checksumMethod themselves are excluded from the hash).
    if (env.CLICKPESA_CHECKSUM_SECRET) {
      checkoutBody.checksum = await clickpesaChecksum(env.CLICKPESA_CHECKSUM_SECRET, checkoutBody);
    }

    const checkoutRes = await fetch('https://api.clickpesa.com/third-parties/checkout-link/generate-checkout-url', {
      method:'POST',
      headers:{
        'Authorization': authHeader,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(checkoutBody),
    });
    const checkout = await checkoutRes.json().catch(()=>({}));
    console.log('ClickPesa checkout response:', JSON.stringify(checkout));

    if (!checkoutRes.ok) {
      throw new Error(checkout.message || 'ClickPesa checkout link failed ('+checkoutRes.status+')');
    }
    const checkoutUrl = checkout.checkoutLink;
    if (!checkoutUrl) throw new Error('ClickPesa did not return a checkoutLink. Response: '+JSON.stringify(checkout).slice(0,300));

    // 3. Store pending payment for callback matching
    await env.CODES_KV.put(`pending:clickpesa:${ref}`, JSON.stringify({plan,email,name:name||email}), {expirationTtl:3600});

    return jsonR({ success:true, checkoutUrl, ref, amount:amountTZS, currency:'TZS' }, 200, env);
  } catch(e) {
    console.error('ClickPesa create error:', e);
    return errR('ClickPesa payment setup failed: '+e.message, 502, env);
  }
}

// ClickPesa webhook -- fired on PAYMENT RECEIVED / PAYMENT FAILED events.
// Verified payload shape: { event, data: { status, orderReference, ... } }
async function handleClickPesaCallback(req, env) {
  try {
    const body = await req.json().catch(()=>({}));
    console.log('ClickPesa webhook received:', JSON.stringify(body));

    const event = body.event || '';
    const data  = body.data || body;
    const ref   = data.orderReference;
    const status = (data.status || '').toUpperCase();

    if (!ref) return jsonR({ok:true}, 200, env);

    // Optional checksum verification (canonical recursive-sort HMAC-SHA256)
    if (env.CLICKPESA_CHECKSUM_SECRET && body.checksum) {
      const { checksum, checksumMethod, ...rest } = body;
      const expected = await clickpesaChecksum(env.CLICKPESA_CHECKSUM_SECRET, rest);
      if (expected !== checksum) {
        console.warn('ClickPesa checksum mismatch for', ref);
        return jsonR({ok:true}, 200, env);
      }
    }

    if (event !== 'PAYMENT RECEIVED' && status !== 'SUCCESS') {
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

// ClickPesa checksum: recursively sort all keys alphabetically at every
// nesting level, JSON-serialize compactly, then HMAC-SHA256 hex digest.
// Verified against https://docs.clickpesa.com/home/checksum
function clickpesaCanonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(clickpesaCanonicalize);
  return Object.keys(obj).sort().reduce((acc,key)=>{ acc[key]=clickpesaCanonicalize(obj[key]); return acc; },{});
}
async function clickpesaChecksum(secret, payload) {
  const canonical = clickpesaCanonicalize(payload);
  const payloadString = JSON.stringify(canonical);
  return await hmacHex(secret, payloadString);
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
