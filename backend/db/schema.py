CREATE_SESSIONS_TABLE = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_key TEXT NOT NULL,
    version_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    status TEXT DEFAULT 'in_progress'
)
"""

CREATE_SESSION_STATE_TABLE = """
CREATE TABLE IF NOT EXISTS session_state (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, key)
)
"""
