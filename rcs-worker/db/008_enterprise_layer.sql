-- D1 Migration: Sprint 8 — Enterprise Layer (Fixed)

CREATE TABLE IF NOT EXISTS enterprise_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  enterprise_group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  property_type TEXT NOT NULL,
  country TEXT,
  city TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enterprise_group_id) REFERENCES enterprise_groups(id)
);

CREATE TABLE IF NOT EXISTS property_users (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS benchmarks (
  id TEXT PRIMARY KEY,
  industry TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  benchmark_value REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS white_label_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  custom_domain TEXT UNIQUE,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Roles
INSERT OR IGNORE INTO roles (id, role_name) VALUES
('role_super_admin', 'SuperAdmin'),
('role_enterprise_admin', 'EnterpriseAdmin'),
('role_regional_director', 'RegionalDirector'),
('role_property_manager', 'PropertyManager'),
('role_marketing_manager', 'MarketingManager'),
('role_operations_manager', 'OperationsManager');

-- Seed Permissions using hex(randomblob(16)) for SQLite compatibility
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_key) VALUES
(hex(randomblob(16)), 'role_super_admin', '*'),
(hex(randomblob(16)), 'role_enterprise_admin', 'manage_group'),
(hex(randomblob(16)), 'role_regional_director', 'view_all_properties'),
(hex(randomblob(16)), 'role_property_manager', 'manage_property'),
(hex(randomblob(16)), 'role_marketing_manager', 'marketing_access'),
(hex(randomblob(16)), 'role_operations_manager', 'operations_access');

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_property_group ON properties(enterprise_group_id);
CREATE INDEX IF NOT EXISTS idx_user_property ON property_users(property_id, user_id);
CREATE INDEX IF NOT EXISTS idx_white_label_org ON white_label_configs(organization_id);
