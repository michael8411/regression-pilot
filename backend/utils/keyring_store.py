import keyring
import structlog

SERVICE = "testdeck"
logger = structlog.get_logger("testdeck.keyring_store")

def get_credential(key: str) -> str | None:
    logger.debug("credential_get", key=key)
    return keyring.get_password(SERVICE, key)

def set_credential(key: str, value: str) -> None:
    keyring.set_password(SERVICE, key, value)
    logger.info("credential_set", key=key)

def delete_credential(key: str) -> None:
    try:
        keyring.delete_password(SERVICE, key)
        logger.info("credential_deleted", key=key)
    except keyring.errors.PasswordDeleteError:
        logger.debug("credential_delete_noop", key=key)
