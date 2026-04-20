# Backend Tests

The test tree mirrors the backend source tree one-for-one. When you add a test
for a module at `backend/<area>/<module>.py`, put it at
`backend/tests/<area>/test_<module>.py`.

## Layout

```
backend/
├── pytest.ini            # discovery + pythonpath config (don't move)
├── run_tests.ps1         # convenience runner that uses .venv
└── tests/
    ├── __init__.py
    ├── README.md         # this file
    ├── utils/            # tests for backend/utils/*
    │   ├── test_crypto.py
    │   └── test_secret_scanner.py
    ├── services/         # tests for backend/services/* (config_service, session_service, ai_service, ...)
    ├── api/              # tests for backend/api/* (route tests via FastAPI TestClient)
    ├── config/           # tests for backend/config/* (settings, preferences)
    └── schemas/          # tests for backend/schemas/* (request model validation)
```

Subdirectories without any tests yet are kept in place (with an empty
`__init__.py`) so the structure is discoverable and the next contributor has
an obvious home for new tests.

## Running the tests

All commands assume you are in `backend/`.

**Run everything (recommended):**
```powershell
.\run_tests.ps1
```

**Run one subdir:**
```powershell
.\run_tests.ps1 tests/utils
```

**Run one file:**
```powershell
.\run_tests.ps1 tests/utils/test_secret_scanner.py
```

**Run tests matching a name pattern:**
```powershell
.\run_tests.ps1 -k "redact"
```

**Raw pytest (if you have the venv activated):**
```powershell
python -m pytest
```

Because `pytest.ini` sets `testpaths = tests` and `pythonpath = .`, pytest
discovers every `test_*.py` under `tests/` automatically and the tests can
import from `utils`, `services`, `config`, etc. exactly the same way the
running backend does — no `sys.path` hacks in the test files themselves.

## Conventions

- **One test file per source module.** Name it `test_<module>.py`.
- **Class-per-concern grouping.** Group related tests in a `TestXxx` class so
  failures show up with meaningful prefixes (`TestEncryptDecrypt::test_...`).
- **Never hit real external services.** If a test would otherwise call
  Windows Credential Manager, Jira, Gemini, or Zephyr, stub it out. See
  `tests/utils/test_crypto.py` for the fake-keyring pattern currently in use;
  when more tests need that fake, promote it to a shared fixture in a
  top-level `tests/conftest.py`.
- **No test should leave artifacts behind.** If a test writes to `.env` or
  `testdeck.db`, use `tmp_path` / monkeypatch so the real files are untouched.

## Shared fixtures (`tests/conftest.py`)

- **`fake_keyring`** — swaps the real `keyring` library for an in-memory fake,
  reloads the downstream modules that cache keyring references
  (`utils.keyring_store`, `utils.crypto`, `config.settings`,
  `services.config_service`), and yields the fake so tests can pre-seed or
  inspect entries. Use this in any test that exercises credential code.
- **`fresh_crypto`** — depends on `fake_keyring`; yields the reloaded
  `utils.crypto` module. Used by `test_crypto.py`.

## Current coverage

| Area | File | Count |
|---|---|---|
| `utils/keyring_store.py` | `tests/utils/test_keyring_store.py` | 9 |
| `utils/crypto.py` | `tests/utils/test_crypto.py` | 12 |
| `utils/secret_scanner.py` | `tests/utils/test_secret_scanner.py` | 20 |
| `schemas/request_models.py` | `tests/schemas/test_request_models.py` | 40 |
| `config/preferences.py` | `tests/config/test_preferences.py` | 18 |
| `config/settings.py` (keyring overlay) | `tests/config/test_settings.py` | 11 |
| `services/config_service.py` (migration code) | `tests/services/test_config_service.py` | 17 |
| `services/ai_service.py` (pure helpers) | `tests/services/test_ai_service_helpers.py` | 28 |
| `api/health_routes.py` | `tests/api/test_health_routes.py` | 3 |
| `api/config_routes.py` (non-network endpoints) | `tests/api/test_config_routes.py` | 15 |

**Total: 173 tests**, all green, full run ≈ 3s.

## Intentionally not tested yet

These require either external-service mocking or are scheduled for
restructuring in a later stage. Added tests here would either lock in
soon-to-change behaviour or duplicate manual verification steps that the
Stage 0 plan already lists.

| Module | Why skipped |
|---|---|
| `services/jira_service.py` | Pure HTTP wrapper; needs `respx` / `httpx.MockTransport` for meaningful tests |
| `services/zephyr_service.py` | Same as above |
| `services/ai_service.py` (`generate_test_cases`, `chat_message`, `stream_chat_message`, `group_tickets_semantic`) | Live Gemini API calls; would need full `google.genai` mock |
| `services/config_service.py` (`test_jira_connection`, `test_gemini_connection`, `test_zephyr_connection`) | Same — live HTTP calls |
| `services/session_service.py` | Has known bugs (broken `get_state`, no encryption/scanner integration yet) that Stage 1 reworks |
| `api/jira_routes.py`, `api/ai_routes.py`, `api/zephyr_routes.py` | Thin wrappers over the service modules above |
| `api/config_routes.py` (`test-jira`, `test-gemini`, `test-zephyr`) | Live HTTP. Covered by the manual verification checklist in `plans/StatePlanning/stage-0-security.md` |
| `config/logging_config.py` | Mostly structlog configuration — low defect risk |
