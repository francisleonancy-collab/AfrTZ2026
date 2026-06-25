-- 006_ai_optimization.sql

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  module_name TEXT NOT NULL,
  prompt_name TEXT NOT NULL,
  active_version TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  prompt_content TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  module_name TEXT NOT NULL,
  prompt_version_id TEXT,
  model_name TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost REAL,
  response_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_evaluations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  quality_score INTEGER,
  hospitality_score INTEGER,
  brand_score INTEGER,
  hallucination_score INTEGER,
  overall_score INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_costs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  month TEXT,
  total_requests INTEGER,
  total_tokens INTEGER,
  total_cost REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_experiments (
  id TEXT PRIMARY KEY,
  prompt_a TEXT,
  prompt_b TEXT,
  winner TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_org ON ai_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_module ON ai_requests(module_name);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created ON ai_requests(created_at);
