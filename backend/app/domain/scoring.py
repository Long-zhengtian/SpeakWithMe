"""How a practice is scored.

改这个文件里的数字，就会改每场对话的分数，以及当天的加权总分。
分数是 0 到 100。只看学习者自己说的句子和已经看完的指正。
不调用模型，也不估等级或发音。
"""

import re
from collections import Counter
from datetime import datetime, timedelta, timezone

# 每场总分、当天总分都按这些权重相加。四项加起来应为 1。
WEIGHTS = {
    "accuracy": 0.40,  # 准确度：已看完的句子里，不用改的占多少
    "vocabulary": 0.25,  # 词汇：自己句子里不同的实词
    "difficulty": 0.15,  # 难度：句子有多长、有没有从句
    "interaction": 0.20,  # 互动：说了几句、每句是不是太短
}

DIMENSIONS = (
    ("accuracy", "准确度"),
    ("vocabulary", "词汇"),
    ("difficulty", "难度"),
    ("interaction", "互动"),
)

# 每句大约这么多个不同的实词，词汇记为 100。
VOCABULARY_WORDS_FOR_FULL = 4.0
# 平均一句这么多个词，难度里的长度部分记为满分。
DIFFICULTY_WORDS_FOR_FULL = 14.0
# 开口句数。1 句是 BASE + STEP，每多一句加 STEP，加到 100 为止。
INTERACTION_TURN_BASE = 20
INTERACTION_TURN_STEP = 10
# 少于此词数的句子，互动里算作太短。
INTERACTION_MIN_WORDS = 4
# 当天总分按每场自己说的句数加权，至少按 1 句算。
DAY_WEIGHT_FLOOR = 1

_WORD = re.compile(r"[A-Za-z']+")
_WEEK = "日一二三四五六"
_FUNCTION_WORDS = {
    "a", "an", "the", "i", "you", "he", "she", "it", "we", "they", "me", "my",
    "your", "his", "her", "our", "their", "is", "am", "are", "was", "were",
    "be", "been", "do", "does", "did", "have", "has", "had", "to", "of", "in",
    "on", "at", "for", "and", "or", "but", "so", "if", "when", "because",
    "that", "this", "with", "from", "not", "no", "yes", "please", "just",
}
_CLAUSE_MARKERS = {"because", "if", "when", "while", "although", "after", "before", "which", "that", "so"}


def score_session(session):
    """Score one practice. Returns the public score plus the counts a day summary needs."""
    users = [message for message in session.messages if message.role == "user"]
    own = [message for message in users if not message.assisted]
    judgments = [_judgment(message) for message in own]
    judged = [item for item in judgments if item]
    clear = sum(1 for item in judged if item == "clear")
    corrected = sum(1 for item in judged if item == "corrected")
    scores = {}
    if judged:
        scores["accuracy"] = _round(100.0 * clear / len(judged))
    scores["vocabulary"] = _vocabulary(own)
    scores["difficulty"] = _difficulty(own)
    scores["interaction"] = _interaction(users, own)
    dimensions = [
        {"id": key, "label_zh": label, "score": scores[key]}
        for key, label in DIMENSIONS
        if key in scores
    ]
    categories = Counter(
        message.correction.category
        for message in own
        if message.correction is not None and message.correction.category
    )
    top_category = categories.most_common(1)[0][0] if categories else ""
    return {
        "total": _weighted(scores),
        "dimensions": dimensions,
        "turns": len(users),
        "own_turns": len(own),
        "clear": clear,
        "corrected": corrected,
        "categories": dict(categories),
        "top_category": top_category,
    }


def progress_calendar(sessions, today=None, days=14):
    """Last `days` local days, plus streak counts across every practiced day."""
    today = today or datetime.now().astimezone().date()
    grouped = {}
    practiced_dates = set()
    for session in sessions:
        by_day = {}
        for message in session.messages:
            if message.role != "user":
                continue
            day = _local_date(message.created_at or session.created_at)
            if day is None:
                continue
            by_day.setdefault(day, []).append(message)
        for day, lines in by_day.items():
            practiced_dates.add(day)
            spoken = session.model_copy(update={"messages": lines, "created_at": lines[0].created_at or session.created_at})
            grouped.setdefault(day, []).append(spoken)
    marks = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        marks.append(_day_mark(day, grouped.get(day, []), day == today))
    streak, best, practice_days, spoke_today = _streaks(practiced_dates, today)
    return {
        "streak": streak,
        "best": best,
        "practice_days": practice_days,
        "spoke_today": spoke_today,
        "days": marks,
    }


def _judgment(message):
    if message.assisted:
        return ""
    status = message.correction_status or ""
    if status == "failed":
        return ""
    if status == "corrected" or message.correction is not None:
        return "corrected"
    if status == "clear" or (message.correction_ready and message.correction is None):
        return "clear"
    return ""


def _vocabulary(own):
    if not own:
        return 0
    content = set()
    for message in own:
        for word in _words(message.text):
            if word not in _FUNCTION_WORDS and len(word) > 1:
                content.add(word)
    per_line = len(content) / float(len(own))
    return _clamp(_round(100.0 * per_line / VOCABULARY_WORDS_FOR_FULL))


def _difficulty(own):
    if not own:
        return 0
    tokens = []
    clauses = 0
    for message in own:
        words = _words(message.text)
        tokens.extend(words)
        clauses += sum(1 for word in words if word in _CLAUSE_MARKERS)
    average = len(tokens) / float(len(own))
    length = min(1.0, average / DIFFICULTY_WORDS_FOR_FULL)
    clause = min(1.0, clauses / float(len(own)))
    return _clamp(_round(100.0 * (0.7 * length + 0.3 * clause)))


def _interaction(users, own):
    turns = len(users)
    if turns == 0:
        return 0
    turn_score = min(100, INTERACTION_TURN_BASE + turns * INTERACTION_TURN_STEP)
    pool = own or users
    substantial = 0
    for message in pool:
        if len(_words(message.text)) >= INTERACTION_MIN_WORDS:
            substantial += 1
    substance = 100.0 * substantial / float(len(pool))
    return _clamp(_round(0.5 * turn_score + 0.5 * substance))


def _weighted(scores):
    chosen = [(scores[key], WEIGHTS[key]) for key in WEIGHTS if key in scores]
    if not chosen:
        return 0
    total_weight = sum(weight for _score, weight in chosen)
    return _clamp(_round(sum(score * weight for score, weight in chosen) / total_weight))


def _day_mark(day, sessions, is_today):
    scored = []
    for session in sessions:
        result = score_session(session)
        weight = max(DAY_WEIGHT_FLOOR, result["own_turns"])
        scored.append((result, weight))
    mark = {
        "date": day.isoformat(),
        "label": _WEEK[(day.weekday() + 1) % 7],
        "today": is_today,
        "sessions": len(sessions),
        "turns": sum(item[0]["turns"] for item in scored),
        "score": None,
        "summary": "",
        "dimensions": [],
    }
    if not scored:
        return mark
    total_weight = float(sum(weight for _result, weight in scored))
    mark["score"] = _clamp(_round(sum(result["total"] * weight for result, weight in scored) / total_weight))
    mark["dimensions"] = _average_dimensions(scored, total_weight)
    mark["summary"] = _summary(day, is_today, scored)
    return mark


def _average_dimensions(scored, total_weight):
    averaged = []
    for key, label in DIMENSIONS:
        chosen = [(result, weight) for result, weight in scored if any(item["id"] == key for item in result["dimensions"])]
        if not chosen:
            continue
        weight_sum = float(sum(weight for _result, weight in chosen))
        value = sum(_dimension_score(result, key) * weight for result, weight in chosen) / weight_sum
        averaged.append({"id": key, "label_zh": label, "score": _clamp(_round(value))})
    if total_weight <= 0:
        return averaged
    return averaged


def _dimension_score(result, key):
    for item in result["dimensions"]:
        if item["id"] == key:
            return item["score"]
    return 0


def _summary(_day, _is_today, scored):
    turns = sum(result["turns"] for result, _weight in scored)
    clear = sum(result["clear"] for result, _weight in scored)
    corrected = sum(result["corrected"] for result, _weight in scored)
    head = "%d 场，说了 %d 句" % (len(scored), turns)
    judged = clear + corrected
    if judged and clear == judged:
        middle = "，这句不用改" if turns == 1 else "，这几句都不用改"
    elif judged and clear == 0:
        middle = "，这句被改过" if turns == 1 else "，这几句都被改过"
    elif judged:
        middle = "，其中 %d 句不用改" % clear
    else:
        middle = ""
    categories = Counter()
    for result, _weight in scored:
        categories.update(result.get("categories") or {})
    tail = ""
    if categories and corrected:
        from app.domain.profile import category_label

        tail = "，改得最多的是%s" % category_label(categories.most_common(1)[0][0])
    return head + middle + tail + "。"


def _streaks(dates, today):
    spoke_today = today in dates
    cursor = today if spoke_today else today - timedelta(days=1)
    streak = 0
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    best = 0
    run = 0
    previous = None
    for day in sorted(dates):
        if previous is not None and (day - previous).days == 1:
            run += 1
        else:
            run = 1
        best = max(best, run)
        previous = day
    return streak, best, len(dates), spoke_today


def _words(text):
    return [word.lower() for word in _WORD.findall(text or "")]


def _local_date(iso_text):
    text = (iso_text or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone().date()


def _clamp(value):
    return max(0, min(100, int(value)))


def _round(value):
    return int(value + 0.5)
