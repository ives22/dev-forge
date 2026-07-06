CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_preferences (
  tool_id TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorite_tools (
  tool_id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id TEXT NOT NULL,
  action TEXT NOT NULL,
  input_preview TEXT,
  output_preview TEXT,
  input_bytes INTEGER NOT NULL DEFAULT 0,
  output_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_usage_created_at ON tool_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_id ON tool_usage(tool_id);
