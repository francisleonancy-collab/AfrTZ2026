-- D1 Migration: Sprint 7 — Partner Portal & Referral Ecosystem

CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  organization_name TEXT NOT NULL,
  partner_type TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  status TEXT DEFAULT 'pending',
  referral_code TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  lead_name TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  organization_name TEXT,
  referral_status TEXT DEFAULT 'new', -- new, demo, customer
  demo_date DATETIME,
  subscription_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  referral_id TEXT NOT NULL,
  subscription_id TEXT,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, paid
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (referral_id) REFERENCES referrals(id)
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payout_status TEXT DEFAULT 'pending',
  payout_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS partner_resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  resource_type TEXT, -- sales_deck, marketing_kit, webinar
  r2_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices for optimization (Agent 7)
CREATE INDEX IF NOT EXISTS idx_partner_email ON partners(email);
CREATE INDEX IF NOT EXISTS idx_referral_partner ON referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_commission_partner ON commissions(partner_id);
