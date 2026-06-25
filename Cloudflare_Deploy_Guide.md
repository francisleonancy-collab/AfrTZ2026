# Mkude — Cloudflare Deployment Guide

This guide provides step-by-step instructions for deploying the Mkude Hospitality Marketing OS to Cloudflare (Workers, Pages, D1, and KV).

---

## Prerequisites
1. A [Cloudflare Account](https://dash.cloudflare.com/).
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed locally (`npm install -g wrangler`).
3. Mkude source code.

---

## Phase 1: Database & Storage Setup

### 1. Create KV Namespaces
Mkude uses two KV namespaces: one for tenant data/codes and one for rate limiting.
```bash
wrangler kv:namespace create CODES_KV
wrangler kv:namespace create RATELIMIT_KV
```
*Note the IDs generated; you will need them for `wrangler.toml`.*

### 2. Create D1 Database
Create the main relational database for AI tracking, partners, and enterprise groups.
```bash
wrangler d1 create mkude-db
```

### 3. Run Migrations
Apply the schemas for all sprints:
```bash
wrangler d1 execute mkude-db --file=./rcs-worker/db/006_ai_optimization.sql
wrangler d1 execute mkude-db --file=./rcs-worker/db/007_partner_portal.sql
wrangler d1 execute mkude-db --file=./rcs-worker/db/008_enterprise_layer.sql
```

---

## Phase 2: Backend (Worker) Deployment

### 1. Configure `wrangler.toml`
Create a `wrangler.toml` file in the `rcs-worker/` directory:
```toml
name = "rcs-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "https://your-domain.pages.dev"
ADMIN_TOKEN = "your-secure-admin-token"
AZAMPAY_SANDBOX = "true"

[[kv_namespaces]]
binding = "CODES_KV"
id = "YOUR_CODES_KV_ID"

[[kv_namespaces]]
binding = "RATELIMIT_KV"
id = "YOUR_RATELIMIT_KV_ID"

[[d1_databases]]
binding = "DB"
database_name = "mkude-db"
database_id = "YOUR_D1_DATABASE_ID"
```

### 2. Set Secrets
Securely store your API keys:
```bash
wrangler secret put ANTHROPIC_KEY
wrangler secret put GEMINI_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put CLICKPESA_CLIENT_ID
wrangler secret put CLICKPESA_API_KEY
wrangler secret put AZAMPAY_CLIENT_ID
wrangler secret put AZAMPAY_CLIENT_SECRET
wrangler secret put AZAMPAY_APP_NAME
```

### 3. Deploy Worker
```bash
cd rcs-worker
wrangler deploy
```
*Note the Worker URL (e.g., `https://rcs-worker.yourname.workers.dev`).*

---

## Phase 3: Frontend (Pages) Deployment

### 1. Configure Worker URL
In `index.html`, ensure the `WORKER_URL` logic points to your deployed backend or set it via the Admin panel in the UI after login.

### 2. Deploy to Cloudflare Pages
You can deploy using the Cloudflare Dashboard or Wrangler:
```bash
wrangler pages deploy . --project-name mkude-os
```

---

## Phase 4: Initial System Setup

1. Open your deployed site.
2. Go to **Admin** (requires the Admin Access Code you created or manually inserted into KV).
3. In **Config**, enter your **Worker API URL**.
4. In **AI Center**, enter your **Admin Token** to unlock analytics and prompt management.
5. Create your first **Enterprise Group** or **Partner** to test the ecosystem.

---

## Troubleshooting
- **CORS Errors:** Check that `ALLOWED_ORIGIN` in `wrangler.toml` matches your frontend URL.
- **D1 Failures:** Ensure all migrations were applied to the production database using the `--remote` flag if needed.
- **AI Errors:** Verify that secrets are correctly set and your API keys have sufficient credits.
