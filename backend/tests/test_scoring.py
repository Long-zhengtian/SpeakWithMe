from datetime import date

from app.domain.models import Correction, Message, Session
from app.domain.scoring import WEIGHTS, progress_calendar, score_session


def _line(text, status="clear", category=""):
    correction = None
    if status == "corrected":
        correction = Correction(
            original_span=text,
            suggestion="A clearer line.",
            category=category or "tense",
            explanation_zh="这里要改。",
        )
    return Message(
        id=text[:12],
        role="user",
        text=text,
        correction=correction,
        correction_ready=status != "pending",
        correction_status="" if status == "pending" else status,
    )


def _session(lines, created_at="2026-11-07T02:00:00+00:00"):
    return Session(id="s", scene_id="weekend", level="A2", created_at=created_at, messages=lines)


def test_weights_are_the_whole_of_a_session_score():
    scored = score_session(_session([_line("I want coffee", "corrected", "politeness")]))
    by_id = {item["id"]: item["score"] for item in scored["dimensions"]}
    assert by_id["accuracy"] == 0
    assert by_id["vocabulary"] == 50
    assert by_id["difficulty"] == 15
    assert by_id["interaction"] == 15
    expected = round(
        sum(by_id[key] * WEIGHTS[key] for key in WEIGHTS) / sum(WEIGHTS.values()) + 1e-9
    )
    assert scored["total"] == expected == 18


def test_a_clear_conversation_scores_higher_than_one_corrected_line():
    short = score_session(_session([_line("I want coffee", "corrected", "politeness")]))
    longer = score_session(
        _session(
            [
                _line("I slept all day because I was tired"),
                _line("I met a friend and we cooked dinner together"),
                _line("We talked about the weekend and walked home"),
                _line("I want to do that again next week"),
            ]
        )
    )
    assert longer["total"] > short["total"]
    assert {item["id"] for item in longer["dimensions"]} == {"accuracy", "vocabulary", "difficulty", "interaction"}


def test_a_pending_line_is_left_out_of_accuracy():
    scored = score_session(_session([_line("I want coffee", "pending")]))
    assert "accuracy" not in {item["id"] for item in scored["dimensions"]}


def test_a_day_weights_a_longer_conversation_more():
    short = _session([_line("I want coffee", "corrected", "politeness")], "2026-11-07T01:00:00+00:00")
    short.id = "short"
    lines = [
        _line("I slept all day because I was tired"),
        _line("I met a friend and we cooked dinner together"),
        _line("We talked about the weekend and walked home"),
        _line("I want to do that again next week"),
    ]
    long = _session(lines, "2026-11-07T05:00:00+00:00")
    long.id = "long"
    calendar = progress_calendar([short, long], today=date(2026, 11, 7))
    today = calendar["days"][-1]
    assert today["today"] is True
    assert today["sessions"] == 2
    assert today["turns"] == 5
    short_score = score_session(short)["total"]
    long_score = score_session(long)["total"]
    expected = int((short_score * 1 + long_score * 4) / 5.0 + 0.5)
    assert today["score"] == expected
    assert today["score"] > short_score
    assert "今天 2 场，说了 5 句" in today["summary"]
    assert "改得最多的是说法" in today["summary"]
    assert calendar["spoke_today"] is True
    assert len(calendar["days"]) == 14
