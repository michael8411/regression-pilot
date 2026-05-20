from datetime import datetime, timezone

import structlog

try:
    from backend.db.connection import get_connection
    from backend.utils import keyring_store
except ImportError:  # pragma: no cover - supports running from backend/ as script
    from db.connection import get_connection
    from utils import keyring_store


logger = structlog.get_logger("testdeck.data")

# Tables included in export (all current Phase 7–10 tables, plus the
# Live workflow artifacts introduced by Phase 01 of the Live redesign).
_EXPORTED_TABLES = (
    "sessions",
    "session_state",
    "conversations",
    "messages",
    "attachments",
    "live_boards",
    "live_pinned_tickets",
    "live_generated_cases",
    "live_activity",
    "mcp_connections",
    "test_cycles",
    "cycle_runs",
)

# Non-secret keyring entries that are safe to include in export.
# API tokens are deliberately excluded — see note in docstring of `export_state`.
_EXPORT_KEYRING_KEYS = (
    "jira_base_url",
    "jira_email",
    "zephyr_base_url",
)

# All keyring keys cleared on a full wipe (keepCredentials=False).
_ALL_KEYRING_KEYS = (
    "jira_base_url",
    "jira_email",
    "jira_api_token",
    "gemini_api_key",
    "zephyr_base_url",
    "zephyr_api_token",
)


async def export_state() -> dict:
    """Return a serialisable snapshot of all non-secret state.

    API tokens are NEVER included. A user who exports their state and
    emails it to themselves would otherwise leak credentials. They must
    re-enter tokens after import. Importing is not in Phase 11 scope.

    Encrypted columns (e.g. `mcp_connections.env`, `messages.content`) are
    exported as their Fernet ciphertext; the receiving install can only
    decrypt them with the same key, which is intentional.
    """
    payload: dict[str, list[dict]] = {}
    async with get_connection() as db:
        for table in _EXPORTED_TABLES:
            try:
                cur = await db.execute(f"SELECT * FROM {table}")
                rows = await cur.fetchall()
            except Exception as e:
                logger.warning("export_table_failed", table=table, error_class=type(e).__name__)
                continue
            payload[table] = [dict(r) for r in rows]

    config = {
        k: keyring_store.get_credential(k) or ""
        for k in _EXPORT_KEYRING_KEYS
    }

    table_counts = {t: len(payload.get(t, [])) for t in _EXPORTED_TABLES}
    logger.info("data_exported", table_counts=table_counts)

    return {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "tables": payload,
        "config": config,
    }


async def wipe_state(*, keep_credentials: bool) -> dict:
    """Truncate all rows; optionally keep keyring credentials.

    Tables are deleted in reverse declaration order so FK-cascading children
    go before parents. SQLite tolerates either order with `ON DELETE CASCADE`,
    but reverse order is also safe if a constraint is missing.
    """
    async with get_connection() as db:
        for table in reversed(_EXPORTED_TABLES):
            try:
                await db.execute(f"DELETE FROM {table}")
            except Exception as e:
                logger.warning(
                    "wipe_table_failed",
                    table=table,
                    error_class=type(e).__name__,
                )
        await db.commit()

    cleared_creds = 0
    if not keep_credentials:
        for k in _ALL_KEYRING_KEYS:
            try:
                if keyring_store.get_credential(k) is not None:
                    keyring_store.delete_credential(k)
                    cleared_creds += 1
            except Exception as e:
                logger.warning(
                    "wipe_credential_failed",
                    key=k,
                    error_class=type(e).__name__,
                )

    logger.info(
        "data_wiped",
        credentials_cleared=cleared_creds,
        kept_credentials=keep_credentials,
    )
    return {"ok": True, "credentials_cleared": cleared_creds}
