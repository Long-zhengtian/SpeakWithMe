from fastapi.testclient import TestClient

from app.config import Settings
from app.domain.models import Phrase, Session
from app.main import create_app
from app.persistence.sqlite import SqliteSessionRepository


def test_backup_round_trip_keeps_the_original_day_and_local_rows():
    client = TestClient(create_app(Settings.for_tests()))
    created = client.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A2"})
    session_id = created.json()["id"]
    client.post("/api/v1/phrases", json={"text": "I went hiking.", "gloss_zh": "我去爬山了。", "kind": "sentence"})
    exported = client.get("/api/v1/backup")
    assert exported.status_code == 200
    body = exported.json()
    assert body["format"] == "speak-with-me-backup"
    assert body["version"] == 1
    original_day = body["sessions"][0]["updated_at"]
    client.delete("/api/v1/sessions/%s" % session_id)
    kept = client.post("/api/v1/sessions", json={"scene_id": "coffee_shop", "level": "A1"})
    imported = client.post("/api/v1/backup", json=body)
    assert imported.status_code == 200
    assert imported.json() == {"sessions": 1, "phrases": 1, "settings": False}
    restored = client.get("/api/v1/sessions/%s" % session_id)
    assert restored.status_code == 200
    assert restored.json()["scene"]["id"] == "weekend"
    again = client.get("/api/v1/backup").json()
    match = next(item for item in again["sessions"] if item["id"] == session_id)
    assert match["updated_at"] == original_day
    ids = {item["id"] for item in again["sessions"]}
    assert kept.json()["id"] in ids
    phrases = client.get("/api/v1/phrases").json()
    assert phrases[0]["text"] == "I went hiking."


def test_backup_rejects_a_file_that_is_not_ours():
    client = TestClient(create_app(Settings.for_tests()))
    response = client.post("/api/v1/backup", json={"format": "notes", "version": 1})
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == "这不是一份练习备份。"


def test_sqlite_replace_keeps_the_stored_time(tmp_path):
    repository = SqliteSessionRepository(str(tmp_path / "practice.sqlite"))
    session = Session(
        id="s1",
        scene_id="coffee_shop",
        level="A1",
        created_at="2026-11-01T00:00:00+00:00",
        updated_at="2026-11-06T00:00:00+00:00",
    )
    phrase = Phrase(
        id="p1",
        kind="word",
        text="late",
        gloss_zh="迟到",
        created_at="2026-11-02T00:00:00+00:00",
    )
    repository.replace_session(session)
    repository.save_phrase(phrase)
    stored = repository.get("s1")
    assert stored.updated_at == "2026-11-06T00:00:00+00:00"
    assert repository.list_phrases()[0].created_at == "2026-11-02T00:00:00+00:00"
