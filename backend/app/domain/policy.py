import re

MAX_MESSAGE_CHARS = 800
MAX_INTENT_CHARS = 400
MAX_USER_TURNS = 30
MAX_REPLY_SENTENCES = 2
MAX_CONTEXT_TURNS = 8


def clean_reply(text):
    cleaned = (text or "").strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in "\"'":
        cleaned = cleaned[1:-1].strip()
    return cleaned


def limit_sentences(text, max_sentences=MAX_REPLY_SENTENCES):
    parts = [part for part in re.split(r"(?<=[.!?])\s+", (text or "").strip()) if part]
    if not parts:
        return ""
    return " ".join(parts[:max_sentences])


def mostly_chinese(text):
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text or ""))
    latin = len(re.findall(r"[A-Za-z]", text or ""))
    return chinese > 0 and chinese >= latin


def ensure_partner_english(text, fallback):
    cleaned = limit_sentences(clean_reply(text))
    if not cleaned or mostly_chinese(cleaned):
        return fallback
    return cleaned
