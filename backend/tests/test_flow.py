import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.domain.policy import limit_sentences
from app.main import create_app


def test_partner_replies_are_cut_to_two_sentences():
    assert limit_sentences("One. Two. Three.") == "One. Two."


def _client():
    app = create_app(Settings.for_tests())
    return TestClient(app), app


def test_catalog_hides_server_only_scene_scripts():
    client, _app = _client()
    response = client.get("/api/v1/catalog")
    assert response.status_code == 200
    body = response.json()
    assert [level["id"] for level in body["levels"]] == ["A1", "A2", "B1"]
    assert [scene["id"] for scene in body["scenes"]] == ["coffee_shop", "running_late", "weekend"]
    raw = response.text
    assert "rescue_en" not in raw
    assert "fallbacks" not in raw
    assert "clarify_en" not in raw


def test_health_lists_extension_slots():
    client, _app = _client()
    body = client.get("/api/v1/health").json()
    assert body["slots"]["llm"] == "mock"
    assert body["slots"]["stt"] is None
    assert body["slots"]["tts"] is None
    assert body["slots"]["repository"] == "memory"
    assert body["slots"]["agents"] == ["chat", "correction", "coach", "recap", "scene", "gloss"]


def test_speech_slots_are_empty():
    client, _app = _client()
    transcribe = client.post("/api/v1/speech/transcribe")
    synthesize = client.post("/api/v1/speech/synthesize", json={"text": "Hello"})
    assert transcribe.status_code == 501
    assert transcribe.json()["detail"]["slot"] == "stt"
    assert synthesize.status_code == 501
    assert synthesize.json()["detail"]["slot"] == "tts"


def test_chat_stays_in_english_and_correction_is_separate():
    client, app = _client()
    created = client.post("/api/v1/sessions", json={"scene_id": "coffee_shop", "level": "A1"})
    assert created.status_code == 200
    session_id = created.json()["id"]
    assert "What can I get for you?" in created.json()["messages"][0]["text"]

    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I want coffee", "assisted": False},
    )
    assert sent.status_code == 200
    reply = sent.json()["assistant_message"]["text"]
    assert "size" in reply.lower()
    assert "Never correct" in app.state.container.llm.calls[-1]["system"]

    message_id = sent.json()["user_message"]["id"]
    corrected = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    again = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    assert corrected.status_code == 200
    suggestion = corrected.json()["correction"]["suggestion"]
    assert "I'd like" in suggestion
    assert again.json() == corrected.json()
    correction_calls = [call for call in app.state.container.llm.calls if call["task"] == "correction"]
    assert len(correction_calls) == 1


def test_chinese_coach_request_never_enters_the_chat():
    client, app = _client()
    session_id = client.post(
        "/api/v1/sessions", json={"scene_id": "coffee_shop", "level": "A1"}
    ).json()["id"]
    coached = client.post(
        "/api/v1/sessions/%s/coach" % session_id,
        json={"intent_zh": "我想要一杯冰拿铁", "variant": 0},
    )
    assert coached.status_code == 200
    sentence = coached.json()["sentence"]
    assert "iced" in sentence.lower()
    assert "latte" in sentence.lower()

    calls_before = len(app.state.container.llm.calls)
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": sentence, "assisted": True},
    )
    assert sent.status_code == 200
    assert sent.json()["user_message"]["assisted"] is True
    chat_calls = [call for call in app.state.container.llm.calls if call["task"] == "chat"]
    blob = json.dumps(chat_calls[-1]["messages"], ensure_ascii=False)
    assert "我想要一杯冰拿铁" not in blob
    assert sentence in blob

    message_id = sent.json()["user_message"]["id"]
    corrected = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    assert corrected.json()["correction"] is None
    assert len(app.state.container.llm.calls) == calls_before + 1
    assert app.state.container.llm.calls[-1]["task"] == "chat"


def test_recap_uses_the_correction_and_the_assisted_line():
    client, _app = _client()
    session_id = client.post(
        "/api/v1/sessions", json={"scene_id": "coffee_shop", "level": "A1"}
    ).json()["id"]
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I want coffee", "assisted": False},
    )
    message_id = sent.json()["user_message"]["id"]
    client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    sentence = client.post(
        "/api/v1/sessions/%s/coach" % session_id,
        json={"intent_zh": "我想要一杯冰拿铁"},
    ).json()["sentence"]
    client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": sentence, "assisted": True},
    )
    recap = client.post("/api/v1/sessions/%s/recap" % session_id)
    assert recap.status_code == 200
    body = recap.json()
    assert "I'd like a coffee, please." in body["try_next"]
    assert sentence in "".join(body["went_well"])
    assert body["keep_sentence"] == sentence
    assert body["revised_from"] == "I want coffee"


def test_unknown_scene_is_a_not_found():
    client, _app = _client()
    response = client.post("/api/v1/sessions", json={"scene_id": "missing", "level": "A1"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "scene_not_found"


def test_profile_keeps_practice_records_and_feedback():
    client, _app = _client()
    assert client.get("/api/v1/profile").json()["stats"]["sessions"] == 0
    created = client.post("/api/v1/sessions", json={"scene_id": "coffee_shop", "level": "A1"})
    assert client.get("/api/v1/profile").json()["stats"]["sessions"] == 0
    session_id = created.json()["id"]
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I want coffee", "assisted": False},
    )
    client.post(
        "/api/v1/sessions/%s/messages/%s/correction" % (session_id, sent.json()["user_message"]["id"])
    )
    client.post("/api/v1/sessions/%s/recap" % session_id)
    profile = client.get("/api/v1/profile").json()
    assert profile["stats"]["sessions"] == 1
    assert profile["stats"]["corrections"] == 1
    assert profile["focus"][0]["category"] == "politeness"
    assert profile["focus"][0]["label_zh"] == "说法"
    assert "I'd like a coffee, please." in profile["latest_feedback"]["try_next"]
    assert profile["records"][0]["scene_title_zh"] == "咖啡店点单"
    assert profile["records"][0]["finished_at"]
    stored = client.get("/api/v1/sessions/%s" % session_id).json()
    assert stored["recap"]["try_next"] == profile["latest_feedback"]["try_next"]


def test_settings_keep_the_key_on_this_machine_and_hide_it(tmp_path, monkeypatch):
    async def fake_models(base_url, api_key):
        if "bigmodel" in base_url:
            return ["glm-4-flash", "glm-4"]
        return ["gpt-4o", "gpt-4o-mini"]

    monkeypatch.setattr("app.services.llm_config.fetch_model_ids", fake_models)
    settings = Settings.for_tests()
    settings.repository = "sqlite"
    settings.data_path = str(tmp_path / "speaking.sqlite")
    secret = "sk-test-secret-1234"
    client = TestClient(create_app(settings))
    opened = client.get("/api/v1/settings")
    assert opened.status_code == 200
    assert opened.json()["api_key_set"] is False
    assert [item["id"] for item in opened.json()["providers"]] == [
        "openai",
        "grok",
        "glm",
        "deepseek",
        "compatible",
    ]
    assert "mock" not in opened.text

    missing = client.put("/api/v1/settings", json={"provider": "glm", "api_key": secret, "model": "glm-4-flash"})
    assert missing.status_code == 422

    listed = client.post("/api/v1/settings/models", json={"provider": "glm", "api_key": secret})
    assert listed.status_code == 200
    assert secret not in listed.text
    glm_listed = next(item for item in listed.json()["providers"] if item["id"] == "glm")
    assert glm_listed["models"] == ["glm-4", "glm-4-flash"]

    saved = client.put("/api/v1/settings", json={"provider": "glm", "model": "glm-4-flash"})
    assert saved.status_code == 200
    assert secret not in saved.text
    assert saved.json()["provider"] == "glm"
    assert saved.json()["model"] == "glm-4-flash"
    assert saved.json()["base_url"] == "https://open.bigmodel.cn/api/paas/v4"
    assert saved.json()["api_key_set"] is True
    assert saved.json()["api_key_hint"].endswith("1234")
    assert client.get("/api/v1/health").json()["slots"]["llm"] == "openai_compatible"

    other = "sk-openai-other-9876"
    client.post("/api/v1/settings/models", json={"provider": "openai", "api_key": other})
    both = client.put("/api/v1/settings", json={"provider": "openai", "model": "gpt-4o-mini"})
    assert secret not in both.text
    assert other not in both.text
    glm = next(item for item in both.json()["providers"] if item["id"] == "glm")
    assert glm["api_key_hint"].endswith("1234")
    assert both.json()["provider"] == "openai"

    kept = client.put("/api/v1/settings", json={"provider": "openai", "api_key": ""})
    assert other not in kept.text
    assert kept.json()["api_key_hint"].endswith("9876")

    reloaded = TestClient(create_app(settings))
    again = reloaded.get("/api/v1/settings")
    assert secret not in again.text
    assert again.json()["api_key_set"] is True
    assert reloaded.get("/api/v1/health").json()["slots"]["llm"] == "openai_compatible"

    cleared = reloaded.put("/api/v1/settings", json={"provider": "openai", "clear_api_key": True})
    assert cleared.json()["api_key_set"] is False
    glm_after = next(item for item in cleared.json()["providers"] if item["id"] == "glm")
    assert glm_after["api_key_set"] is True
    assert reloaded.get("/api/v1/health").json()["slots"]["llm"] == "unconfigured"
    blocked = reloaded.post("/api/v1/sessions", json={"scene_id": "coffee_shop", "level": "A1"})
    assert blocked.status_code == 428
    assert blocked.json()["detail"]["message"] == "先在设置里填上 API key。"


def test_sqlite_repository_reloads_a_session(tmp_path):
    settings = Settings.for_tests()
    settings.repository = "sqlite"
    settings.data_path = str(tmp_path / "speaking.sqlite")
    first = TestClient(create_app(settings))
    created = first.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A2"})
    session_id = created.json()["id"]
    first.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I watched a movie", "assisted": False},
    )
    second = TestClient(create_app(settings))
    loaded = second.get("/api/v1/sessions/%s" % session_id)
    assert loaded.status_code == 200
    assert loaded.json()["scene"]["title_zh"] == "聊聊周末"
    assert any(message["text"] == "I watched a movie" for message in loaded.json()["messages"])
    assert second.get("/api/v1/profile").json()["stats"]["sessions"] == 1


def test_custom_scene_stays_out_of_chinese_in_the_chat():
    client, app = _client()
    created = client.post(
        "/api/v1/sessions",
        json={"level": "A1", "situation_zh": "我在机场找丢失的行李", "corrections_enabled": True},
    )
    assert created.status_code == 200
    assert created.json()["scene"]["title_zh"] == "机场找行李"
    assert created.json()["messages"][0]["text"] == "Hi. How can I help you?"
    sent = client.post(
        "/api/v1/sessions/%s/messages" % created.json()["id"],
        json={"text": "I lost my bag", "assisted": False},
    )
    assert sent.status_code == 200
    assert "bag" in sent.json()["assistant_message"]["text"].lower()
    chat_calls = [call for call in app.state.container.llm.calls if call["task"] == "chat"]
    assert "机场" not in chat_calls[-1]["system"]
    assert "luggage" in chat_calls[-1]["system"]


def test_spoken_slips_get_one_correction_and_a_clear_line_does_not():
    client, _app = _client()
    session_id = client.post(
        "/api/v1/sessions", json={"scene_id": "weekend", "level": "A2"}
    ).json()["id"]
    expected = {
        "i slept all day": None,
        "I say I slept all day": "I slept all day.",
        "yes it's very fun": "Yes, it was fun.",
        "myself": "I was by myself.",
        "yeah because I'm so tired for work": "Yeah because I'm so tired from work.",
    }
    for text, suggestion in expected.items():
        sent = client.post(
            "/api/v1/sessions/%s/messages" % session_id,
            json={"text": text, "assisted": False},
        )
        message_id = sent.json()["user_message"]["id"]
        corrected = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
        correction = corrected.json()["correction"]
        if suggestion is None:
            assert correction is None
        else:
            assert correction["suggestion"] == suggestion


def test_corrections_can_be_turned_off_for_a_scene():
    client, app = _client()
    created = client.post(
        "/api/v1/sessions",
        json={"scene_id": "coffee_shop", "level": "A1", "corrections_enabled": False},
    )
    session_id = created.json()["id"]
    assert created.json()["corrections_enabled"] is False
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I want coffee", "assisted": False},
    )
    calls_before = len(app.state.container.llm.calls)
    corrected = client.post(
        "/api/v1/sessions/%s/messages/%s/correction" % (session_id, sent.json()["user_message"]["id"])
    )
    assert corrected.json()["correction"] is None
    assert len(app.state.container.llm.calls) == calls_before


def test_a_word_can_be_saved_in_the_phrase_book(tmp_path):
    settings = Settings.for_tests()
    settings.repository = "sqlite"
    settings.data_path = str(tmp_path / "speaking.sqlite")
    client = TestClient(create_app(settings))
    gloss = client.post("/api/v1/glossary", json={"text": "latte"})
    assert gloss.status_code == 200
    assert gloss.json()["gloss_zh"] == "拿铁"
    saved = client.post(
        "/api/v1/phrases",
        json={"text": "latte", "gloss_zh": gloss.json()["gloss_zh"], "kind": "word"},
    )
    again = client.post(
        "/api/v1/phrases",
        json={"text": "Latte", "gloss_zh": "拿铁", "kind": "word"},
    )
    assert saved.json()["id"] == again.json()["id"]
    reloaded = TestClient(create_app(settings))
    listed = reloaded.get("/api/v1/phrases")
    assert listed.status_code == 200
    assert listed.json()[0]["text"] == "latte"
    removed = reloaded.delete("/api/v1/phrases/%s" % saved.json()["id"])
    assert removed.status_code == 200
    assert reloaded.get("/api/v1/phrases").json() == []

