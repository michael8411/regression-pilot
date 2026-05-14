import structlog

try:
    from backend.db.connection import get_connection
    from backend.db.schema import (
        CREATE_SESSIONS_TABLE,
        CREATE_SESSION_STATE_TABLE,
        CREATE_CONVERSATIONS_TABLE,
        CREATE_MESSAGES_TABLE,
        CREATE_MESSAGES_INDEX,
        CREATE_ATTACHMENTS_TABLE,
        CREATE_ATTACHMENTS_INDEX,
        CREATE_LIVE_BOARDS_TABLE,
        CREATE_LIVE_BOARDS_INDEX,
        CREATE_TEST_CYCLES_TABLE,
        CREATE_TEST_CYCLES_INDEX,
        CREATE_CYCLE_RUNS_TABLE,
        CREATE_CYCLE_RUNS_INDEX,
        CREATE_MCP_CONNECTIONS_TABLE,
        CREATE_LIVE_PINNED_TICKETS_TABLE,
        CREATE_LIVE_GENERATED_CASES_TABLE,
        CREATE_LIVE_GENERATED_CASES_INDEX,
        CREATE_LIVE_ACTIVITY_TABLE,
        CREATE_LIVE_ACTIVITY_CREATED_INDEX,
        CREATE_LIVE_ACTIVITY_BOARD_INDEX,
        CREATE_PROJECT_REPO_MAP_TABLE,
    )
    from backend.utils.crypto import encrypt_value, get_encryptor
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from db.schema import (
        CREATE_SESSIONS_TABLE,
        CREATE_SESSION_STATE_TABLE,
        CREATE_CONVERSATIONS_TABLE,
        CREATE_MESSAGES_TABLE,
        CREATE_MESSAGES_INDEX,
        CREATE_ATTACHMENTS_TABLE,
        CREATE_ATTACHMENTS_INDEX,
        CREATE_LIVE_BOARDS_TABLE,
        CREATE_LIVE_BOARDS_INDEX,
        CREATE_TEST_CYCLES_TABLE,
        CREATE_TEST_CYCLES_INDEX,
        CREATE_CYCLE_RUNS_TABLE,
        CREATE_CYCLE_RUNS_INDEX,
        CREATE_MCP_CONNECTIONS_TABLE,
        CREATE_LIVE_PINNED_TICKETS_TABLE,
        CREATE_LIVE_GENERATED_CASES_TABLE,
        CREATE_LIVE_GENERATED_CASES_INDEX,
        CREATE_LIVE_ACTIVITY_TABLE,
        CREATE_LIVE_ACTIVITY_CREATED_INDEX,
        CREATE_LIVE_ACTIVITY_BOARD_INDEX,
        CREATE_PROJECT_REPO_MAP_TABLE,
    )
    from utils.crypto import encrypt_value, get_encryptor


logger = structlog.get_logger("testdeck.db")

# Fernet v1 tokens are base64url and always start with this prefix through ~2048.
_FERNET_PREFIX = "gAAAAAB"


async def init_db() -> None:
    async with get_connection() as db:
        await db.execute("PRAGMA journal_mode = WAL")
        await db.execute(CREATE_SESSIONS_TABLE)
        await db.execute(CREATE_SESSION_STATE_TABLE)
        await db.execute(CREATE_CONVERSATIONS_TABLE)
        await db.execute(CREATE_MESSAGES_TABLE)
        await db.execute(CREATE_MESSAGES_INDEX)
        await db.execute(CREATE_ATTACHMENTS_TABLE)
        await db.execute(CREATE_ATTACHMENTS_INDEX)
        await db.execute(CREATE_LIVE_BOARDS_TABLE)
        await db.execute(CREATE_LIVE_BOARDS_INDEX)
        await db.execute(CREATE_TEST_CYCLES_TABLE)
        await db.execute(CREATE_TEST_CYCLES_INDEX)
        await db.execute(CREATE_CYCLE_RUNS_TABLE)
        await db.execute(CREATE_CYCLE_RUNS_INDEX)
        await db.execute(CREATE_MCP_CONNECTIONS_TABLE)
        # Phase 01 — Live workflow durable storage.
        await db.execute(CREATE_LIVE_PINNED_TICKETS_TABLE)
        await db.execute(CREATE_LIVE_GENERATED_CASES_TABLE)
        await db.execute(CREATE_LIVE_GENERATED_CASES_INDEX)
        await db.execute(CREATE_LIVE_ACTIVITY_TABLE)
        await db.execute(CREATE_LIVE_ACTIVITY_CREATED_INDEX)
        await db.execute(CREATE_LIVE_ACTIVITY_BOARD_INDEX)
        await db.execute(CREATE_PROJECT_REPO_MAP_TABLE)
        await db.commit()

        get_encryptor()

        rows_migrated = await _migrate_plaintext_state_rows(db)
        await _migrate_attachments_kind_check(db)
        await _migrate_live_boards_profile_columns(db)
        await _migrate_mcp_connections_transport(db)

    logger.info("db_initialized", rows_migrated=rows_migrated)


async def _migrate_live_boards_profile_columns(db) -> None:
    """Phase 01 (Live Testing redesign): add `profile` + `view_prefs` columns.

    Existing rows keep their defaults of `''` (empty/unset) so the service
    layer treats them as "no profile recorded yet". Idempotent — uses
    PRAGMA table_info before each ALTER.
    """
    cursor = await db.execute("PRAGMA table_info(live_boards)")
    cols = {row["name"] for row in await cursor.fetchall()}
    changed = False
    if "profile" not in cols:
        await db.execute(
            "ALTER TABLE live_boards ADD COLUMN profile TEXT NOT NULL DEFAULT ''"
        )
        changed = True
    if "view_prefs" not in cols:
        await db.execute(
            "ALTER TABLE live_boards ADD COLUMN view_prefs TEXT NOT NULL DEFAULT ''"
        )
        changed = True
    if changed:
        await db.commit()
        logger.info("live_boards_profile_columns_migrated")


async def _migrate_mcp_connections_transport(db) -> None:
    """Phase 4: add transport + url columns to mcp_connections.

    Existing stdio rows are left intact (transport defaults to 'stdio',
    url defaults to ''). Idempotent — checks PRAGMA before each ADD.
    """
    cursor = await db.execute("PRAGMA table_info(mcp_connections)")
    cols = {row["name"] for row in await cursor.fetchall()}
    changed = False
    if "transport" not in cols:
        await db.execute(
            "ALTER TABLE mcp_connections ADD COLUMN transport TEXT NOT NULL DEFAULT 'stdio'"
        )
        changed = True
    if "url" not in cols:
        await db.execute(
            "ALTER TABLE mcp_connections ADD COLUMN url TEXT NOT NULL DEFAULT ''"
        )
        changed = True
    if changed:
        await db.commit()
        logger.info("mcp_connections_transport_migrated")


async def _migrate_attachments_kind_check(db) -> None:
    """Phase 9c: extend the attachments.kind CHECK to include 'mcp_tool'.

    SQLite stores CHECK constraints as part of the original CREATE TABLE SQL,
    so widening a CHECK requires rebuilding the table. We gate this on a
    single inspection of the schema row — fresh installs already have the
    new constraint via CREATE_ATTACHMENTS_TABLE; existing installs need
    the rebuild.
    """
    cursor = await db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='attachments'"
    )
    row = await cursor.fetchone()
    if not row:
        return
    sql = (row["sql"] or "")
    if "mcp_tool" in sql:
        return  # already widened

    logger.info("attachments_kind_check_migrating")
    await db.execute("BEGIN IMMEDIATE")
    try:
        await db.execute("PRAGMA foreign_keys = OFF")
        await db.execute(
            """
            CREATE TABLE attachments_new (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                kind            TEXT NOT NULL CHECK (kind IN ('ticket','test_case','session_ref','mcp_tool')),
                ref             TEXT NOT NULL,
                created_at      TEXT NOT NULL
            )
            """
        )
        await db.execute(
            """
            INSERT INTO attachments_new (id, conversation_id, kind, ref, created_at)
            SELECT id, conversation_id, kind, ref, created_at FROM attachments
            """
        )
        await db.execute("DROP TABLE attachments")
        await db.execute("ALTER TABLE attachments_new RENAME TO attachments")
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_attachments_convo "
            "ON attachments (conversation_id)"
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    finally:
        await db.execute("PRAGMA foreign_keys = ON")
    logger.info("attachments_kind_check_migrated")


async def _migrate_plaintext_state_rows(db) -> int:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM session_state WHERE value NOT LIKE ?",
        (f"{_FERNET_PREFIX}%",),
    )
    count_row = await cursor.fetchone()
    plaintext_count = count_row[0] if count_row else 0
    if plaintext_count == 0:
        return 0

    # Single transaction: partial failure rolls back before commit.
    cursor = await db.execute(
        "SELECT session_id, key, value FROM session_state WHERE value NOT LIKE ?",
        (f"{_FERNET_PREFIX}%",),
    )
    rows = await cursor.fetchall()

    await db.execute("BEGIN IMMEDIATE")
    try:
        for row in rows:
            encrypted = encrypt_value(row["value"])
            await db.execute(
                "UPDATE session_state SET value = ? WHERE session_id = ? AND key = ?",
                (encrypted, row["session_id"], row["key"]),
            )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise

    logger.info("state_migration_completed", rows_migrated=len(rows))
    return len(rows)
