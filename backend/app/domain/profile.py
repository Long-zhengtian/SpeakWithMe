from collections import Counter

from app.domain.scenes import get_scene
from app.domain.scoring import progress_calendar, score_session

CATEGORY_LABELS = {
    "article": "冠词",
    "tense": "时态",
    "agreement": "一致",
    "word_choice": "用词",
    "word_order": "语序",
    "politeness": "说法",
    "other": "表达",
}


def category_label(category):
    return CATEGORY_LABELS.get(category, category)


def build_profile(sessions):
    practiced = [session for session in sessions if _user_messages(session)]
    corrections = []
    user_turns = 0
    assisted_turns = 0
    for session in practiced:
        title, _partner = _scene_view(session)
        for message in reversed(session.messages):
            if message.role != "user":
                continue
            user_turns += 1
            if message.assisted:
                assisted_turns += 1
            if message.correction is None:
                continue
            corrections.append(
                {
                    "suggestion": message.correction.suggestion,
                    "explanation_zh": message.correction.explanation_zh,
                    "category": message.correction.category,
                    "label_zh": category_label(message.correction.category),
                    "scene_title_zh": title,
                }
            )
    counts = Counter(item["category"] for item in corrections)
    focus = [
        {"category": category, "label_zh": category_label(category), "count": count}
        for category, count in counts.most_common(3)
    ]
    latest = next((session for session in practiced if session.recap is not None), None)
    latest_feedback = None
    if latest is not None and latest.recap is not None:
        title, _partner = _scene_view(latest)
        latest_feedback = {
            "scene_title_zh": title,
            "finished_at": latest.finished_at or latest.updated_at,
            "went_well": list(latest.recap.went_well),
            "try_next": latest.recap.try_next,
            "keep_sentence": latest.recap.keep_sentence,
            "revised_from": latest.recap.revised_from,
        }
    return {
        "stats": {
            "sessions": len(practiced),
            "user_turns": user_turns,
            "corrections": len(corrections),
            "assisted_turns": assisted_turns,
        },
        "focus": focus,
        "recent_corrections": corrections[:6],
        "latest_feedback": latest_feedback,
        "records": [_record(session) for session in practiced[:30]],
        "activity": _activity(practiced),
        "progress": progress_calendar(practiced),
    }


def _activity(sessions):
    points = []
    for session in sessions:
        for message in session.messages:
            if message.role != "user":
                continue
            at = (message.created_at or "").strip() or session.created_at
            if at:
                points.append({"at": at})
    return points


def _user_messages(session):
    return [message for message in session.messages if message.role == "user"]


def _scene_view(session):
    if session.custom_scene is not None:
        title, partner = session.custom_scene.title_zh, session.custom_scene.partner_name
    else:
        scene = get_scene(session.scene_id)
        if scene is None:
            title, partner = "已下线的场景", ""
        else:
            title, partner = scene.title_zh, scene.partner_name
    override = (session.title_zh or "").strip()
    if override:
        title = override
    return title, partner


def _record(session):
    title, partner = _scene_view(session)
    users = _user_messages(session)
    preview = users[-1].text if users else ""
    if len(preview) > 80:
        preview = preview[:80] + "…"
    return {
        "id": session.id,
        "scene_title_zh": title,
        "partner_name": partner,
        "level": session.level,
        "created_at": session.created_at,
        "finished_at": session.finished_at,
        "user_turns": len(users),
        "correction_count": sum(1 for message in users if message.correction is not None),
        "assisted_turns": sum(1 for message in users if message.assisted),
        "try_next": session.recap.try_next if session.recap is not None else None,
        "preview": preview,
        "score": _public_score(score_session(session)),
    }


def _public_score(result):
    return {"total": result["total"], "dimensions": result["dimensions"]}
