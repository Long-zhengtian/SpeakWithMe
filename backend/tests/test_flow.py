import json

import brotli
from fastapi.testclient import TestClient

from app.config import Settings
from app.dictionary import LocalDictionary
from app.domain.policy import limit_sentences
from app.main import create_app
from app.providers.openai_compatible import LLMError


def test_partner_replies_are_cut_to_two_sentences():
    assert limit_sentences("One. Two. Three.") == "One. Two."
    assert limit_sentences("One. Two.", 1) == "One."
    assert limit_sentences("One. Two. Three. Four.", 3) == "One. Two. Three."


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
    assert "Fix every problem" in correction_calls[0]["system"]
    assert "At most one correction" not in correction_calls[0]["system"]
    assert corrected.json()["correction"]["original_span"] == "I want coffee"


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
    assert profile["records"][0]["score"]["total"] >= 0
    assert {item["id"] for item in profile["records"][0]["score"]["dimensions"]} >= {"vocabulary", "interaction"}
    assert len(profile["progress"]["days"]) == 14
    assert profile["progress"]["days"][-1]["today"] is True
    assert "今天" in profile["progress"]["days"][-1]["summary"]
    assert profile["activity"]
    assert profile["records"][0]["finished_at"]
    stored = client.get("/api/v1/sessions/%s" % session_id).json()
    assert stored["recap"]["try_next"] == profile["latest_feedback"]["try_next"]


def test_a_finished_session_can_start_again_from_the_opening_or_a_line():
    client, _app = _client()
    created = client.post("/api/v1/sessions", json={"scene_id": "coffee_shop", "level": "A1"})
    session_id = created.json()["id"]
    opening = created.json()["messages"][0]
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I want coffee", "assisted": False},
    )
    user_line = sent.json()["user_message"]
    client.post("/api/v1/sessions/%s/recap" % session_id)

    restarted = client.post("/api/v1/sessions/%s/fork" % session_id, json={})
    assert restarted.status_code == 200
    assert restarted.json()["id"] != session_id
    assert restarted.json()["finished_at"] is None
    assert [item["text"] for item in restarted.json()["messages"]] == [opening["text"]]
    assert client.get("/api/v1/sessions/%s" % session_id).json()["finished_at"]

    continued = client.post(
        "/api/v1/sessions/%s/fork" % session_id,
        json={"through_message_id": user_line["id"]},
    )
    assert continued.status_code == 200
    texts = [item["text"] for item in continued.json()["messages"]]
    assert texts[0] == opening["text"]
    assert texts[1] == "I want coffee"
    assert continued.json()["messages"][-1]["role"] == "assistant"
    assert continued.json()["messages"][1]["correction"] is None
    stored = client.get("/api/v1/sessions/%s" % session_id).json()
    assert len(stored["messages"]) == 3

    missing = client.post(
        "/api/v1/sessions/%s/fork" % session_id,
        json={"through_message_id": "missing-line"},
    )
    assert missing.status_code == 404


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


def test_a_practice_record_can_be_renamed_and_deleted():
    client, _app = _client()
    session_id = client.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A1"}).json()["id"]
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I slept all day", "assisted": False},
    )
    assert sent.status_code == 200
    renamed = client.patch("/api/v1/sessions/%s" % session_id, json={"title_zh": "周末补觉"})
    assert renamed.status_code == 200
    assert renamed.json()["scene"]["title_zh"] == "周末补觉"
    records = client.get("/api/v1/profile").json()["records"]
    assert records[0]["id"] == session_id
    assert records[0]["scene_title_zh"] == "周末补觉"
    blank = client.patch("/api/v1/sessions/%s" % session_id, json={"title_zh": "   "})
    assert blank.status_code == 422
    missing = client.delete("/api/v1/sessions/missing-session")
    assert missing.status_code == 404
    deleted = client.delete("/api/v1/sessions/%s" % session_id)
    assert deleted.status_code == 200
    assert client.get("/api/v1/sessions/%s" % session_id).status_code == 404
    left = client.get("/api/v1/profile").json()["records"]
    assert all(item["id"] != session_id for item in left)


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


def test_a_failed_correction_can_be_asked_again():
    client, app = _client()
    session_id = client.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A1"}).json()["id"]
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I want coffee", "assisted": False},
    )
    message_id = sent.json()["user_message"]["id"]
    agent = app.state.container.sessions.correction_agent
    original = agent.review

    async def fail(session, message, level):
        raise LLMError("down")

    agent.review = fail
    failed = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    assert failed.status_code == 502
    assert failed.json()["detail"]["message"] == "这句指正没有看完，模型调用失败。"
    stored = client.get("/api/v1/sessions/%s" % session_id).json()
    user = next(item for item in stored["messages"] if item["id"] == message_id)
    assert user["correction"] is None
    assert user["correction_status"] == "failed"
    agent.review = original
    again = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    assert again.status_code == 200
    assert again.json()["correction_status"] in ("clear", "corrected")


def test_a_clear_line_is_marked_clear():
    client, _app = _client()
    session_id = client.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A2"}).json()["id"]
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "i slept all day", "assisted": False},
    )
    message_id = sent.json()["user_message"]["id"]
    corrected = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    assert corrected.status_code == 200
    assert corrected.json()["correction"] is None
    assert corrected.json()["correction_status"] == "clear"


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


def test_plural_entry_keeps_the_base_meaning_ahead_of_a_rare_sense():
    found = LocalDictionary().lookup("pictures")
    assert found["lemma"] == "picture"
    assert "图画" in found["definitions"][0]
    assert any("电影院" in line for line in found["definitions"])


def test_dictionary_folds_an_inflected_word_back_to_its_entry(tmp_path):
    payload = {"bag": ["bæg", "n. 包"]}
    (tmp_path / "b.json.br").write_bytes(brotli.compress(json.dumps(payload).encode()))
    found = LocalDictionary(tmp_path).lookup("bags")
    assert found["lemma"] == "bag"
    assert found["gloss_zh"] == "n. 包"
    assert found["phonetic"] == "bæg"


def test_a_word_can_be_saved_in_the_phrase_book(tmp_path):
    settings = Settings.for_tests()
    settings.repository = "sqlite"
    settings.data_path = str(tmp_path / "speaking.sqlite")
    client = TestClient(create_app(settings))
    calls_before = len(client.app.state.container.llm.calls)
    gloss = client.post("/api/v1/glossary", json={"text": "latte"})
    assert gloss.status_code == 200
    body = gloss.json()
    assert "拿铁" in body["gloss_zh"]
    assert body["phonetic"]
    assert body["definitions"]
    assert len(client.app.state.container.llm.calls) == calls_before
    folded = client.post("/api/v1/glossary", json={"text": "running"})
    assert folded.status_code == 200
    missing = client.post("/api/v1/glossary", json={"text": "zzzznotaword"})
    assert missing.status_code == 404
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
    assert listed.json()[0]["learning_status"] == "learning"
    learned = reloaded.patch(
        "/api/v1/phrases/%s" % saved.json()["id"],
        json={"learning_status": "mastered"},
    )
    assert learned.status_code == 200
    assert learned.json()["learning_status"] == "mastered"
    removed = reloaded.delete("/api/v1/phrases/%s" % saved.json()["id"])
    assert removed.status_code == 200
    assert reloaded.get("/api/v1/phrases").json() == []


def test_a_practice_can_pass_thirty_user_turns():
    from app.domain.models import Message, new_id

    client, app = _client()
    created = client.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A1"})
    session_id = created.json()["id"]
    repository = app.state.container.sessions.repository
    session = repository.get(session_id)
    for _ in range(30):
        session.messages.append(Message(id=new_id(), role="user", text="I slept all day", correction_ready=True))
        session.messages.append(Message(id=new_id(), role="assistant", text="Okay.", correction_ready=True))
    repository.save(session)
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I slept all day", "assisted": False},
    )
    assert sent.status_code == 200
    stored = repository.get(session_id)
    assert sum(1 for item in stored.messages if item.role == "user") == 31


def test_a_long_transcript_is_folded_before_the_model_sees_it():
    from app.domain.models import Message, new_id
    from app.domain.policy import CHAT_RECENT_MESSAGES

    client, app = _client()
    created = client.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A1"})
    session_id = created.json()["id"]
    repository = app.state.container.sessions.repository
    session = repository.get(session_id)
    early = "I walked in the park and talked about the river. " * 20
    for _ in range(18):
        session.messages.append(Message(id=new_id(), role="user", text=early, correction_ready=True))
        session.messages.append(Message(id=new_id(), role="assistant", text="Tell me more.", correction_ready=True))
    repository.save(session)
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "Then I went home.", "assisted": False},
    )
    assert sent.status_code == 200
    chat_calls = [call for call in app.state.container.llm.calls if call["task"] == "chat"]
    assert len(chat_calls[-1]["messages"]) == CHAT_RECENT_MESSAGES
    assert chat_calls[-1]["messages"][-1]["content"] == "Then I went home."
    assert "Already talked about:" in chat_calls[-1]["system"]
    assert "park" in chat_calls[-1]["system"]
    stored = repository.get(session_id)
    assert len(stored.messages) > CHAT_RECENT_MESSAGES
    assert stored.folded_summary
    assert "park" in stored.folded_summary


def test_bad_json_is_asked_again_and_a_second_failure_is_kept():
    client, app = _client()
    session_id = client.post("/api/v1/sessions", json={"scene_id": "weekend", "level": "A1"}).json()["id"]
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "i slept all day", "assisted": False},
    )
    message_id = sent.json()["user_message"]["id"]
    llm = app.state.container.llm
    original = llm.complete
    state = {"n": 0}

    async def once_then_json(system, messages, task, response_format):
        if task == "correction":
            state["n"] += 1
            if state["n"] == 1:
                return "nope"
            return '{"correction": null}'
        return await original(system, messages, task, response_format)

    llm.complete = once_then_json
    corrected = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    assert corrected.status_code == 200
    assert state["n"] == 2
    assert corrected.json()["correction_status"] == "clear"

    state["n"] = 0

    async def always_bad(system, messages, task, response_format):
        if task == "correction":
            state["n"] += 1
            return "still nope"
        return await original(system, messages, task, response_format)

    llm.complete = always_bad
    sent = client.post(
        "/api/v1/sessions/%s/messages" % session_id,
        json={"text": "I say I slept all day", "assisted": False},
    )
    message_id = sent.json()["user_message"]["id"]
    failed = client.post("/api/v1/sessions/%s/messages/%s/correction" % (session_id, message_id))
    assert failed.status_code == 502
    assert state["n"] == 2
    stored = app.state.container.sessions.get_session(session_id)
    user = next(item for item in stored.messages if item.id == message_id)
    assert user.correction_status == "failed"
    assert user.correction_ready is False

