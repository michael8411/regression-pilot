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

CREATE_CONVERSATIONS_TABLE = """
CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'New conversation',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    archived    INTEGER NOT NULL DEFAULT 0,
    meta        TEXT NOT NULL DEFAULT '{}'
)
"""

CREATE_MESSAGES_TABLE = """
CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    meta            TEXT NOT NULL DEFAULT '{}'
)
"""

CREATE_MESSAGES_INDEX = """
CREATE INDEX IF NOT EXISTS idx_messages_convo
    ON messages (conversation_id, created_at)
"""

CREATE_ATTACHMENTS_TABLE = """
CREATE TABLE IF NOT EXISTS attachments (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('ticket','test_case','session_ref','mcp_tool')),
    ref             TEXT NOT NULL,
    created_at      TEXT NOT NULL
)
"""

CREATE_ATTACHMENTS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_attachments_convo
    ON attachments (conversation_id)
"""

CREATE_LIVE_BOARDS_TABLE = """
CREATE TABLE IF NOT EXISTS live_boards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    jql         TEXT NOT NULL,
    columns     TEXT NOT NULL DEFAULT '[]',
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    profile     TEXT NOT NULL DEFAULT '',
    view_prefs  TEXT NOT NULL DEFAULT ''
)
"""

CREATE_LIVE_BOARDS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_live_boards_pinned_updated
    ON live_boards (pinned DESC, updated_at DESC)
"""

# ---------------------------------------------------------------------------
# Live workflow artifacts — Phase 01 of Live Testing redesign.
#
# Sensitive payload columns are stored as encrypted JSON strings (Fernet);
# the columns themselves are TEXT NOT NULL DEFAULT '' so legacy rows stay
# valid. The application layer is responsible for encrypt/decrypt via
# `utils.crypto`; the schema does not constrain content beyond that.
# ---------------------------------------------------------------------------

CREATE_LIVE_PINNED_TICKETS_TABLE = """
CREATE TABLE IF NOT EXISTS live_pinned_tickets (
    ticket_key       TEXT PRIMARY KEY,
    board_id         TEXT,
    ticket_snapshot  TEXT NOT NULL DEFAULT '',
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
)
"""

CREATE_LIVE_GENERATED_CASES_TABLE = """
CREATE TABLE IF NOT EXISTS live_generated_cases (
    id                TEXT PRIMARY KEY,
    ticket_key        TEXT NOT NULL,
    board_id          TEXT,
    instructions      TEXT NOT NULL DEFAULT '',
    cases_json        TEXT NOT NULL,
    context_metadata  TEXT NOT NULL DEFAULT '',
    export_metadata   TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'draft',
    exported_at       TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
)
"""

CREATE_LIVE_GENERATED_CASES_INDEX = """
CREATE INDEX IF NOT EXISTS idx_live_generated_cases_ticket
    ON live_generated_cases (ticket_key, updated_at DESC)
"""

CREATE_LIVE_ACTIVITY_TABLE = """
CREATE TABLE IF NOT EXISTS live_activity (
    id          TEXT PRIMARY KEY,
    board_id    TEXT,
    ticket_key  TEXT,
    kind        TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
)
"""

CREATE_LIVE_ACTIVITY_CREATED_INDEX = """
CREATE INDEX IF NOT EXISTS idx_live_activity_created
    ON live_activity (created_at DESC)
"""

CREATE_LIVE_ACTIVITY_BOARD_INDEX = """
CREATE INDEX IF NOT EXISTS idx_live_activity_board
    ON live_activity (board_id, created_at DESC)
"""

CREATE_TEST_CYCLES_TABLE = """
CREATE TABLE IF NOT EXISTS test_cycles (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    project_key     TEXT NOT NULL,
    version_hint    TEXT NOT NULL DEFAULT '',
    ticket_keys     TEXT NOT NULL DEFAULT '[]',
    themes          TEXT NOT NULL DEFAULT '[]',
    test_case_refs  TEXT NOT NULL DEFAULT '[]',
    pinned          INTEGER NOT NULL DEFAULT 0,
    archived        INTEGER NOT NULL DEFAULT 0,
    last_run_at     TEXT,
    last_run_id     TEXT,
    run_count       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
)
"""

CREATE_TEST_CYCLES_INDEX = """
CREATE INDEX IF NOT EXISTS idx_test_cycles_pinned_updated
    ON test_cycles (pinned DESC, updated_at DESC)
"""

CREATE_CYCLE_RUNS_TABLE = """
CREATE TABLE IF NOT EXISTS cycle_runs (
    id              TEXT PRIMARY KEY,
    cycle_id        TEXT NOT NULL REFERENCES test_cycles(id) ON DELETE CASCADE,
    session_id      TEXT,
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT NOT NULL CHECK (
                       status IN ('started','session_created','abandoned','completed','failed')
                    ) DEFAULT 'started',
    notes           TEXT NOT NULL DEFAULT ''
)
"""

CREATE_CYCLE_RUNS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_cycle_runs_cycle
    ON cycle_runs (cycle_id, started_at DESC)
"""

CREATE_MCP_CONNECTIONS_TABLE = """
CREATE TABLE IF NOT EXISTS mcp_connections (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    command       TEXT NOT NULL,
    args          TEXT NOT NULL DEFAULT '[]',
    env           TEXT NOT NULL DEFAULT '',
    enabled       INTEGER NOT NULL DEFAULT 1,
    auto_approve  TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    transport     TEXT NOT NULL DEFAULT 'stdio',
    url           TEXT NOT NULL DEFAULT ''
)
"""

CREATE_PROJECT_REPO_MAP_TABLE = """
CREATE TABLE IF NOT EXISTS project_repo_map (
    id            TEXT PRIMARY KEY,
    jira_project  TEXT NOT NULL UNIQUE,
    platform      TEXT NOT NULL CHECK (platform IN ('github','azure_devops')),
    org           TEXT NOT NULL DEFAULT '',
    repo          TEXT NOT NULL DEFAULT '',
    ado_project   TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
)
"""
