import structlog

try:
    from backend.db.connection import get_connection
    from backend.db.schema import CREATE_SESSIONS_TABLE, CREATE_SESSION_STATE_TABLE
    from backend.utils.crypto import encrypt_value, get_encryptor
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from db.schema import CREATE_SESSIONS_TABLE, CREATE_SESSION_STATE_TABLE
    from utils.crypto import encrypt_value, get_encryptor


logger = structlog.get_logger("testdeck.db")

# Fernet v1 tokens are base64url and always start with this prefix through ~2048.
_FERNET_PREFIX = "gAAAAAB"


async def init_db() -> None:
    async with get_connection() as db:
        await db.execute("PRAGMA journal_mode = WAL")
        await db.execute(CREATE_SESSIONS_TABLE)
        await db.execute(CREATE_SESSION_STATE_TABLE)
        await db.commit()

        get_encryptor()

        rows_migrated = await _migrate_plaintext_state_rows(db)

    logger.info("db_initialized", rows_migrated=rows_migrated)


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
