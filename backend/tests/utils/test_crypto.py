"""Tests for crypto encryption and key lifecycle."""

import pytest
from cryptography.fernet import Fernet, InvalidToken


class TestFernetKeyLifecycle:

    def test_first_run_creates_key(self, fake_keyring, fresh_crypto):
        assert fake_keyring.get_password("testdeck", "fernet_key") is None
        fresh_crypto.get_encryptor()
        stored = fake_keyring.get_password("testdeck", "fernet_key")
        assert stored is not None
        assert len(stored) > 0

    def test_second_call_reuses_encryptor(self, fresh_crypto):
        enc1 = fresh_crypto.get_encryptor()
        enc2 = fresh_crypto.get_encryptor()
        assert enc1 is enc2

    def test_existing_key_loaded_not_overwritten(self, fake_keyring, fresh_crypto):
        known_key = Fernet.generate_key().decode("utf-8")
        fake_keyring.set_password("testdeck", "fernet_key", known_key)

        fresh_crypto._encryptor = None
        fresh_crypto.get_encryptor()

        stored = fake_keyring.get_password("testdeck", "fernet_key")
        assert stored == known_key

    def test_corrupt_key_raises_runtime_error(self, fake_keyring, fresh_crypto):
        fake_keyring.set_password("testdeck", "fernet_key", "not-a-valid-fernet-key")
        fresh_crypto._encryptor = None
        with pytest.raises(RuntimeError, match="Invalid Fernet encryption key"):
            fresh_crypto.get_encryptor()


class TestEncryptDecrypt:

    def test_token_starts_with_fernet_prefix(self, fresh_crypto):
        token = fresh_crypto.encrypt_value("hello world")
        assert token.startswith("gAAAAAB"), f"Unexpected prefix: {token[:10]}"

    def test_round_trip(self, fresh_crypto):
        plaintext = "hello world"
        token = fresh_crypto.encrypt_value(plaintext)
        assert fresh_crypto.decrypt_value(token) == plaintext

    def test_different_plaintexts_produce_different_tokens(self, fresh_crypto):
        t1 = fresh_crypto.encrypt_value("value_one")
        t2 = fresh_crypto.encrypt_value("value_two")
        assert t1 != t2

    def test_mutated_token_raises_invalid_token(self, fresh_crypto):
        token = fresh_crypto.encrypt_value("hello world")
        mutated = token[:-1] + ("X" if token[-1] != "X" else "Y")
        with pytest.raises(InvalidToken):
            fresh_crypto.decrypt_value(mutated)

    def test_empty_string_round_trip(self, fresh_crypto):
        token = fresh_crypto.encrypt_value("")
        assert fresh_crypto.decrypt_value(token) == ""

    def test_unicode_round_trip(self, fresh_crypto):
        plaintext = "unicode: 日本語 🔐"
        token = fresh_crypto.encrypt_value(plaintext)
        assert fresh_crypto.decrypt_value(token) == plaintext

    def test_same_plaintext_produces_different_tokens(self, fresh_crypto):
        """Fernet is non-deterministic (random IV) — same input != same token."""
        t1 = fresh_crypto.encrypt_value("same")
        t2 = fresh_crypto.encrypt_value("same")
        assert t1 != t2

    def test_wrong_key_raises_invalid_token(self, fake_keyring, fresh_crypto):
        token = fresh_crypto.encrypt_value("secret")

        new_key = Fernet.generate_key().decode("utf-8")
        fake_keyring.set_password("testdeck", "fernet_key", new_key)
        fresh_crypto._encryptor = None

        with pytest.raises(InvalidToken):
            fresh_crypto.decrypt_value(token)
