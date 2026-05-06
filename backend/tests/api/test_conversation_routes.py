import asyncio
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "conversations_routes_test.db"


@pytest.fixture
def conversation_client(fake_keyring, db_path, monkeypatch):
    import db.connection as conn_mod
    monkeypatch.setattr(conn_mod, "DB_PATH", db_path)

    from db.init import init_db
    asyncio.run(init_db())

    from api.conversation_routes import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _create(client, **body):
    return client.post("/conversations", json=body)


class TestCRUD:

    def test_post_create(self, conversation_client):
        r = _create(conversation_client, title="test")
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "test"
        assert "id" in body

    def test_post_create_default_title(self, conversation_client):
        r = _create(conversation_client)
        assert r.status_code == 200
        assert r.json()["title"] == "New conversation"

    def test_list_empty(self, conversation_client):
        r = conversation_client.get("/conversations")
        assert r.status_code == 200
        assert r.json() == []

    def test_get_unknown_404(self, conversation_client):
        r = conversation_client.get("/conversations/does-not-exist")
        assert r.status_code == 404

    def test_get_returns_full_thread(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.get(f"/conversations/{cid}")
        assert r.status_code == 200
        body = r.json()
        assert body["conversation"]["id"] == cid
        assert body["messages"] == []
        assert body["attachments"] == []

    def test_patch_pinned(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.patch(f"/conversations/{cid}", json={"pinned": True})
        assert r.status_code == 200
        assert r.json()["pinned"] is True

    def test_patch_archived(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.patch(
            f"/conversations/{cid}", json={"archived": True}
        )
        assert r.status_code == 200
        assert r.json()["archived"] is True

    def test_patch_unknown_404(self, conversation_client):
        r = conversation_client.patch(
            "/conversations/does-not-exist", json={"pinned": True}
        )
        assert r.status_code == 404

    def test_delete(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.delete(f"/conversations/{cid}")
        assert r.status_code == 200
        assert r.json()["deleted"] is True
        assert conversation_client.get(f"/conversations/{cid}").status_code == 404

    def test_delete_unknown_returns_false(self, conversation_client):
        r = conversation_client.delete("/conversations/does-not-exist")
        assert r.status_code == 200
        assert r.json()["deleted"] is False

    def test_list_excludes_archived_by_default(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        conversation_client.patch(f"/conversations/{cid}", json={"archived": True})
        ids = [c["id"] for c in conversation_client.get("/conversations").json()]
        assert cid not in ids

    def test_list_include_archived(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        conversation_client.patch(f"/conversations/{cid}", json={"archived": True})
        ids = [
            c["id"]
            for c in conversation_client.get(
                "/conversations?includeArchived=true"
            ).json()
        ]
        assert cid in ids


class TestMessages:

    def test_append_message(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.post(
            f"/conversations/{cid}/messages",
            json={"role": "user", "content": "hello"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["message"]["content"] == "hello"
        assert body["message"]["role"] == "user"
        assert body["secret_scan_warnings"] == []

    def test_append_unknown_404(self, conversation_client):
        r = conversation_client.post(
            "/conversations/does-not-exist/messages",
            json={"role": "user", "content": "x"},
        )
        assert r.status_code == 404

    def test_secret_warning_no_preview(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.post(
            f"/conversations/{cid}/messages",
            json={
                "role": "user",
                "content": "Server=foo;Password=Bar1234;Initial Catalog=baz",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["secret_scan_warnings"]
        for w in body["secret_scan_warnings"]:
            assert set(w.keys()) == {"pattern_name"}
        raw = r.text
        assert "match_preview" not in raw


class TestStream:

    def test_no_user_message_emits_error(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        with conversation_client.stream(
            "POST", f"/conversations/{cid}/messages/stream", json={}
        ) as r:
            events = [
                line for line in r.iter_lines() if line.startswith("data:")
            ]
        assert events
        assert any('"error"' in e for e in events)

    def test_streams_with_mocked_ai(self, conversation_client, monkeypatch):
        cid = _create(conversation_client).json()["id"]
        conversation_client.post(
            f"/conversations/{cid}/messages",
            json={"role": "user", "content": "hi"},
        )

        import services.conversation_service as svc

        async def fake_stream(messages, tickets):
            yield "one "
            yield "two"

        monkeypatch.setattr(svc.ai_service, "stream_chat_message", fake_stream)

        with conversation_client.stream(
            "POST", f"/conversations/{cid}/messages/stream", json={}
        ) as r:
            events = [
                line for line in r.iter_lines() if line.startswith("data:")
            ]

        assert any('"text": "one "' in e or '"text":"one "' in e for e in events)
        assert any('"done"' in e for e in events)


class TestAttachments:

    def test_round_trip(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.post(
            f"/conversations/{cid}/attachments",
            json={"kind": "ticket", "ref": "FM-1"},
        )
        assert r.status_code == 200
        aid = r.json()["id"]

        r = conversation_client.delete(f"/conversations/{cid}/attachments/{aid}")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    def test_attach_unknown_404(self, conversation_client):
        r = conversation_client.post(
            "/conversations/does-not-exist/attachments",
            json={"kind": "ticket", "ref": "FM-1"},
        )
        assert r.status_code == 404

    def test_invalid_kind_422(self, conversation_client):
        cid = _create(conversation_client).json()["id"]
        r = conversation_client.post(
            f"/conversations/{cid}/attachments",
            json={"kind": "bogus", "ref": "FM-1"},
        )
        assert r.status_code == 422
