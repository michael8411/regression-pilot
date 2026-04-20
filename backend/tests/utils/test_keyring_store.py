"""Tests for keyring_store wrappers."""

import pytest


class TestSetAndGet:

    def test_set_and_get_roundtrip(self, fake_keyring):
        from utils.keyring_store import get_credential, set_credential
        set_credential("roundtrip_key", "hello")
        assert get_credential("roundtrip_key") == "hello"

    def test_get_missing_returns_none(self, fake_keyring):
        from utils.keyring_store import get_credential
        assert get_credential("does_not_exist") is None

    def test_set_overwrites_existing(self, fake_keyring):
        from utils.keyring_store import get_credential, set_credential
        set_credential("overwrite_key", "first")
        set_credential("overwrite_key", "second")
        assert get_credential("overwrite_key") == "second"

    def test_service_name_is_testdeck(self, fake_keyring):
        """Every entry must live under the `testdeck` service namespace."""
        from utils.keyring_store import SERVICE, set_credential
        assert SERVICE == "testdeck"
        set_credential("namespaced_key", "value")
        assert fake_keyring.get_password("testdeck", "namespaced_key") == "value"
        assert fake_keyring.get_password("other_service", "namespaced_key") is None


class TestDelete:

    def test_delete_removes_entry(self, fake_keyring):
        from utils.keyring_store import delete_credential, get_credential, set_credential
        set_credential("del_key", "value")
        delete_credential("del_key")
        assert get_credential("del_key") is None

    def test_delete_missing_is_idempotent(self, fake_keyring):
        """Stage 0 plan requires delete_credential to swallow PasswordDeleteError."""
        from utils.keyring_store import delete_credential
        delete_credential("never_existed")  # first call
        delete_credential("never_existed")  # second call — still must not raise

    def test_delete_then_reset(self, fake_keyring):
        """set → delete → set should produce a clean new value, not a ghost."""
        from utils.keyring_store import delete_credential, get_credential, set_credential
        set_credential("cycle", "one")
        delete_credential("cycle")
        set_credential("cycle", "two")
        assert get_credential("cycle") == "two"


class TestMultipleKeys:

    def test_distinct_keys_are_independent(self, fake_keyring):
        from utils.keyring_store import get_credential, set_credential
        set_credential("key_a", "alpha")
        set_credential("key_b", "beta")
        assert get_credential("key_a") == "alpha"
        assert get_credential("key_b") == "beta"

    def test_deleting_one_does_not_affect_others(self, fake_keyring):
        from utils.keyring_store import delete_credential, get_credential, set_credential
        set_credential("keep", "survivor")
        set_credential("remove", "doomed")
        delete_credential("remove")
        assert get_credential("keep") == "survivor"
        assert get_credential("remove") is None
