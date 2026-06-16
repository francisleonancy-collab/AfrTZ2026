# Mkude — Complete Deployment Guide v2
**Lefking Enterprise (T) Ltd · 2026**
> Payments: M-Pesa Direct + DPO Pay + PayPal · Language: English + Swahili · Live pricing admin

---

## Architecture Overview

```
Browser (Cloudflare Pages — mkude.com)
         │
         ├─── M-Pesa STK Push ──────► Daraja API ──► /mpesa-callback
         ├─── DPO Pay redirect ─────► DPO hosted ──► /dpo-callback
         ├─── PayPal button ────────► PayPal SDK ──► /confirm-paypal
         └─── Generate content ─────► Worker
                                          │
                              ┌───────────┼───────────────┐
                         Claude AI    Gemini AI       Resend Email
                         (paid plans) (promo+fallback) (code delivery)
                                          │
                                    Cloudflare KV
                                    (codes + config)
```

**Phase 1 (now):** Cloudflare Pages + Worker + M-Pesa + DPO Pay + PayPal + Resend
**Phase 2 (after go-live):** Apply for Lemon Squeezy merchant verification

---

## Step 0 — Accounts to Create First

| Service | URL | Purpose | Cost |
|---|---|---|---|
| Cloudflare | cloudflare.com | Pages + Worker + KV | Free |
| Resend | resend.com | Email delivery | Free (3k/mo) |
| Safaricom Daraja | developer.safaricom.co.ke | M-Pesa payments | Free |
| DPO Pay | dpogroup.com | Cards + all mobile money | Free signup |
| PayPal Developer | developer.paypal.com | International cards | Free |
| Anthropic | console.anthropic.com | Claude writing (paid plans) | Pay per use |
| Google AI Studio | aistudio.google.com | Gemini (promo + fallback) | Free tier |

---

## Step 1 — Cloudflare Setup (15 min)

```bash
# Install Wrangler
npm install -g wrangler
wrangler login

# Create KV namespaces
wrangler kv:namespace create CODES_KV
wrangler kv:namespace create RATELIMIT_KV
# Copy both IDs printed — paste into wrangler.toml
```

### wrangler.toml
```toml
name = "rcs-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "CODES_KV"
id = "PASTE_CODES_KV_ID"

[[kv_namespaces]]
binding = "RATELIMIT_KV"
id = "PASTE_RATELIMIT_KV_ID"

[vars]
ALLOWED_ORIGIN = "https://mkude.com"
```

---

## Step 2 — Resend Email Setup (10 min)

1. Sign up at **resend.com**
2. Domains → Add Domain → `mkude.com`
3. Add DNS records shown to Cloudflare DNS
4. Wait for **Verified ✅**
5. API Keys → Create Key → copy (starts with `re_`)

---

## Step 3 — AI API Keys (5 min)

### Anthropic (Claude)
1. console.anthropic.com → API Keys → Create
2. Settings → Billing → set **monthly spend limit $10**
3. Copy key (`sk-ant-...`)

### Google Gemini
1. aistudio.google.com → Get API key → Create
2. Copy key (`AIzaSy...`)
3. **Free tier** — no billing needed for your usage level

---

## Step 4 — M-Pesa Daraja Setup (2–3 days)

### 4a. Register and get sandbox credentials (today)
1. developer.safaricom.co.ke → Sign up
2. My Apps → Add New App → select **M-Pesa Express**
3. Get sandbox: Consumer Key + Consumer Secret
4. Sandbox shortcode: `174379`
5. Sandbox passkey: `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`

### 4b. Apply for production (start today — takes 2–3 days)
1. Daraja Dashboard → **Go Live**
2. Business: `Lefking Enterprise (T) Ltd` / or sole trader `Mkude`
3. Request a **C2B Paybill** shortcode
4. Callback URL: `https://rcs-worker.YOUR.workers.dev/mpesa-callback`
5. Submit → Safaricom emails production credentials in 2–3 days

### 4c. M-Pesa pricing (set in Admin → Pricing Settings)
| Plan | TZS | KES |
|---|---|---|
| Starter | 7,500 | 400 |
| Growth | 15,000 | 800 |
| Premium | 22,500 | 1,200 |

---

## Step 5 — DPO Pay Setup (3–5 days)

### 5a. Apply online or visit in person (fastest)
**DPO Tanzania office:**
One Payment Tanzania Limited
1st Floor Acacia Estates, 84 Kinondoni Road, Dar es Salaam
📞 +255 22 2198051 · +255 782 500011

**Online:** dpogroup.com/online-payments/tanzania → Get Started

### 5b. What you need for DPO application
- Business registration certificate (BRELA) OR personal ID (sole trader)
- TIN certificate
- Business bank account details
- Website URL: `https://mkude.com`
- Expected monthly volume (estimate)

### 5c. What DPO gives you
- **Company Token** (your merchant ID)
- **Service Type code** for your product category
- Access to their test environment

### 5d. DPO callback URL to provide them
```
https://rcs-worker.YOUR-SUBDOMAIN.workers.dev/dpo-callback
```

### 5e. What DPO adds beyond M-Pesa Direct
| Method | M-Pesa Direct | With DPO |
|---|---|---|
| Vodacom M-Pesa | ✅ | ✅ |
| Tigo Pesa | ❌ | ✅ |
| Airtel Money | ❌ | ✅ |
| Visa / Mastercard | ❌ | ✅ |
| Amex | ❌ | ✅ |
| International cards | ❌ | ✅ |

---

## Step 6 — PayPal Setup (same day)

### 6a. Create PayPal Business account
1. paypal.com → Sign Up → Business
2. Verify email + link bank account

### 6b. Get API credentials
1. developer.paypal.com → Log in → Apps & Credentials
2. Create App → name: `Mkude`
3. Copy **Client ID** and **Client Secret** (Sandbox first, then Live)

### 6c. Important PayPal notes
- Tanzanian customers **cannot pay via PayPal** — M-Pesa/DPO handles them
- PayPal is for **international customers** (Europe, US, Asia)
- Replace `REPLACE_PAYPAL_CLIENT_ID` in `mkude_v1.html` with your Live Client ID
- Use sandbox Client ID for testing: `sb` accounts

---

## Step 7 — Set All Worker Secrets

```bash
cd rcs-worker

# AI
wrangler secret put ANTHROPIC_KEY
wrangler secret put GEMINI_KEY

# Email
wrangler secret put RESEND_API_KEY

# Admin
wrangler secret put ADMIN_TOKEN
# Use a strong password e.g. Mkude-Admin-2026-XYZ — write it down safely

# M-Pesa (sandbox first)
wrangler secret put MPESA_CONSUMER_KEY
wrangler secret put MPESA_CONSUMER_SECRET
wrangler secret put MPESA_SHORTCODE
# Enter: 174379  (sandbox)
wrangler secret put MPESA_PASSKEY
# Enter: bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919  (sandbox)
wrangler secret put MPESA_CALLBACK_URL
# Enter: https://rcs-worker.YOUR.workers.dev/mpesa-callback

# DPO Pay
wrangler secret put DPO_COMPANY_TOKEN
# Enter your DPO Company Token when received
wrangler secret put DPO_SERVICE_TYPE
# Enter your DPO Service Type code (e.g. 3854 for software)

# PayPal (use sandbox first, replace with live later)
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_CLIENT_SECRET
```

---

## Step 8 — Deploy Worker

```bash
cd rcs-worker
npm install
wrangler deploy

# Expected output:
# ✨ Built successfully
# 🌀 Uploading worker script
# ✨ Deployed to rcs-worker.YOUR-SUBDOMAIN.workers.dev

# Health check:
curl https://rcs-worker.YOUR-SUBDOMAIN.workers.dev/health
# Returns: {"status":"ok","version":"4.0","payments":["mpesa","dpo","paypal"]}

# Seed admin code:
wrangler kv:key put --binding=CODES_KV "ADMIN000" \
  '{"plan":"Admin","client":"Mkude Admin","email":"support@mkude.com","expiry":"2036-01-01","active":true,"used":0,"limit":-1,"created":"2026-01-01"}'
```

---

## Step 9 — Update HTML with Your Worker URL

In `mkude_v1.html`, find the `init()` function and add your Worker URL as default:

```javascript
// Change this line:
let WORKER_URL = '';

// To:
let WORKER_URL = 'https://rcs-worker.YOUR-SUBDOMAIN.workers.dev';
```

Also replace PayPal Client ID in the SDK script tag:
```html
<!-- Find this line: -->
<script src="https://www.paypal.com/sdk/js?client-id=REPLACE_PAYPAL_CLIENT_ID&currency=USD"

<!-- Replace with your Live Client ID: -->
<script src="https://www.paypal.com/sdk/js?client-id=AYour_Live_PayPal_Client_ID&currency=USD"
```

---

## Step 10 — Deploy Frontend to Cloudflare Pages

### Option A — Drag and drop (2 minutes)
1. Rename `mkude_v1.html` → `index.html`
2. Go to **pages.cloudflare.com**
3. Create project → **Direct Upload**
4. Drag `index.html`
5. Project name: `mkude`
6. Deploy → live at `mkude.pages.dev`

### Option B — Custom domain
1. Register `mkude.com` at Cloudflare Registrar (~$10/year)
2. Pages → your project → Custom Domains → Add `mkude.com`
3. Cloudflare auto-configures DNS

### Netlify _headers file (add to deployment)
Create `_headers` file alongside `index.html`:
```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-XSS-Protection: 1; mode=block
```

---

## Step 11 — Switch to Production Credentials

### M-Pesa production (when Safaricom emails you)
```bash
wrangler secret put MPESA_CONSUMER_KEY    # production key
wrangler secret put MPESA_CONSUMER_SECRET # production secret
wrangler secret put MPESA_SHORTCODE       # your Paybill number
wrangler secret put MPESA_PASSKEY         # production passkey
wrangler deploy
```
Test with a real TZS 100 payment on your own phone before going public.

### PayPal live (when ready)
```bash
wrangler secret put PAYPAL_CLIENT_ID      # Live client ID
wrangler secret put PAYPAL_CLIENT_SECRET  # Live client secret
wrangler deploy
```
Also update the PayPal SDK script tag in `index.html`.

---

## Step 12 — Admin Panel: Live Pricing

Once deployed and logged in as Admin:
1. Open toolkit → **⚙️ Admin** tab
2. Scroll to **💰 Pricing Settings**
3. Update any USD, TZS or KES amounts
4. Click **💾 Save & apply now** → site updates instantly
5. Click **☁️ Push to Worker** → Worker uses new amounts for M-Pesa and DPO charges

This means you can change pricing without redeploying — just save and push.

---

## Step 13 — Go Live Checklist ✅

```
□ Cloudflare account created
□ CODES_KV and RATELIMIT_KV created
□ Worker deployed → /health returns v4.0
□ ADMIN000 seeded into KV
□ Resend domain mkude.com verified ✅
□ Test email received from no-reply@mkude.com
□ Anthropic key set + spend limit $10/month configured
□ Gemini key set (free tier)
□ ADMIN_TOKEN set and saved securely offline
□ M-Pesa sandbox tested — STK push arrives on test phone
□ M-Pesa production credentials received and switched
□ Real M-Pesa payment tested (TZS 100) → code received by email
□ DPO credentials received and set
□ DPO test payment (card) → code received by email
□ PayPal sandbox tested → code received by email
□ PayPal live credentials switched
□ Frontend deployed to Cloudflare Pages
□ mkude.com custom domain connected
□ Worker URL hardcoded in index.html
□ PayPal Client ID replaced in index.html
□ Sign in with ADMIN000 → test all 3 payment tabs
□ Language toggle EN ↔ SW works
□ Sign out returns to landing (nav reappears)
□ Admin pricing update tested — push to Worker confirmed
□ BRELA business name registration submitted
□ TIN registered at TRA
```

---

## Step 14 — Lemon Squeezy (Phase 2, after go-live)

Apply only after site is live with real customers:

### What Lemon Squeezy needs to see
- ✅ Live website at mkude.com with real content
- ✅ Clear product description (SaaS software subscription)
- ✅ Privacy policy page (add `/privacy.html`)
- ✅ Terms page (add `/terms.html`)
- ✅ Business email: support@mkude.com
- ✅ Government ID + BRELA certificate OR TIN

### How to frame your product for LS approval
**Describe as:** "SaaS software — customers subscribe to access a web application that generates restaurant content. Access is delivered via a unique code sent to customer email."
**NOT:** "service" or "content writing service" — use "software" and "SaaS"

### Pre-application checklist
```
□ Email LS support: "Do you support payouts to Tanzanian bank accounts?"
   support@lemonsqueezy.com
□ Confirm: "Do you approve SaaS tools that deliver access codes?"
□ Get written confirmation before building the integration
□ Add privacy.html and terms.html to your Pages deployment
□ Have BRELA certificate OR government ID ready for upload
```

---

## All Worker Secrets Reference

```bash
# AI
ANTHROPIC_KEY           sk-ant-...
GEMINI_KEY              AIzaSy...

# Email
RESEND_API_KEY          re_...

# Admin
ADMIN_TOKEN             strong-password-here

# M-Pesa
MPESA_CONSUMER_KEY      from Daraja dashboard
MPESA_CONSUMER_SECRET   from Daraja dashboard
MPESA_SHORTCODE         174379 (sandbox) → your Paybill (production)
MPESA_PASSKEY           bfb279... (sandbox) → from Safaricom (production)
MPESA_CALLBACK_URL      https://rcs-worker.YOUR.workers.dev/mpesa-callback

# DPO Pay
DPO_COMPANY_TOKEN       from DPO dashboard
DPO_SERVICE_TYPE        3854 (software/SaaS — confirm with DPO)

# PayPal
PAYPAL_CLIENT_ID        from developer.paypal.com
PAYPAL_CLIENT_SECRET    from developer.paypal.com

# Config
ALLOWED_ORIGIN          https://mkude.com
```

---

## Demo Codes for Testing

| Code | Plan | Notes |
|---|---|---|
| `DEMO1234` | Growth | 100 tasks, paid features |
| `DEMOPROMO` | Promo | 3 tasks, Gemini only |
| `ADMIN000` | Admin | Full dashboard, pricing admin |

---

## Support Contacts

**Lefking Enterprise (T) Ltd**
- Email: support@mkude.com
- WhatsApp: +255 768 777 057
- Location: Dar es Salaam, Tanzania

**Key dashboards:**
- Cloudflare: dash.cloudflare.com
- Resend: resend.com/emails
- Daraja: developer.safaricom.co.ke
- DPO: secure.3gdirectpay.com/merchants
- PayPal: developer.paypal.com
- Anthropic: console.anthropic.com/usage

---

*Mkude Deployment Guide v2 · June 2026 · Lefking Enterprise (T) Ltd*
