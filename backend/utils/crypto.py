import structlog
from cryptography.fernet import Fernet, InvalidToken

from .keyring_store import get_credential, set_credential

logger = structlog.get_logger("testdeck.crypto")

_encryptor: Fernet | None = None


def _load_or_create_fernet_key() -> bytes:
    key = get_credential("fernet_key")
    if not key:
        generated_key = Fernet.generate_key()
        set_credential("fernet_key", generated_key.decode("utf-8"))
        logger.info("fernet_key_created")
        return generated_key
    logger.debug("fernet_key_loaded_from_keyring")
    return key.encode("utf-8")


def get_encryptor() -> Fernet:
    global _encryptor
    if _encryptor is not None:
        return _encryptor
    raw = _load_or_create_fernet_key()
    try:
        _encryptor = Fernet(raw)
        logger.info("fernet_encryptor_initialized")
    except ValueError as e:
        logger.critical(
            "fernet_key_invalid",
            hint=(
                "Stored fernet_key is corrupt or not a valid Fernet key. "
                "Remove the testdeck/fernet_key entry in Windows Credential Manager "
                "(or your OS keyring), delete backend/testdeck.db if you need a clean slate, "
                "then restart the backend."
            ),
        )
        raise RuntimeError(
            "Invalid Fernet encryption key in credential store; see log for recovery steps."
        ) from e
    return _encryptor


def encrypt_value(plaintext: str) -> str:
    try:
        return get_encryptor().encrypt(plaintext.encode("utf-8")).decode("utf-8")
    except Exception:
        logger.critical("state_encrypt_failed")
        raise


def decrypt_value(ciphertext: str) -> str:
    try:
        return get_encryptor().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.warning("state_decrypt_invalid_token")
        raise
    except Exception:
        logger.critical("state_decrypt_failed")
        raise
