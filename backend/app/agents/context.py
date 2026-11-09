import json
import logging

from app.agents.prompts import fold_system
from app.domain.policy import CHAT_CONTEXT_CHARS, CHAT_RECENT_MESSAGES, clean_reply, mostly_chinese
from app.providers.openai_compatible import LLMError

logger = logging.getLogger(__name__)


def transcript_chars(messages):
    return sum(len(message.text or "") for message in messages)


def _prefix_and_recent(messages, folded_until_id):
    recent = list(messages[-CHAT_RECENT_MESSAGES:])
    prefix = list(messages[:-CHAT_RECENT_MESSAGES])
    start = 0
    if folded_until_id:
        found = next((index for index, message in enumerate(prefix) if message.id == folded_until_id), None)
        if found is not None:
            start = found + 1
    return prefix, prefix[start:], recent


def local_covered(pending, previous):
    parts = []
    if previous:
        parts.append(previous.strip())
    for message in pending:
        bit = " ".join((message.text or "").split())
        if not bit:
            continue
        if len(bit) > 180:
            bit = bit[:177] + "..."
        who = "Learner" if message.role == "user" else "Partner"
        parts.append("%s: %s" % (who, bit))
    text = " ".join(parts).strip()
    if len(text) > 900:
        text = text[-900:]
    return text


async def fold_transcript(llm, session):
    """Keep the saved transcript whole. Fold only the copy sent to the model."""
    messages = list(session.messages)
    if transcript_chars(messages) <= CHAT_CONTEXT_CHARS or len(messages) <= CHAT_RECENT_MESSAGES:
        return messages, ""
    prefix, pending, recent = _prefix_and_recent(messages, session.folded_until_id)
    summary = (session.folded_summary or "").strip()
    if pending:
        summary = await _summarize(llm, summary, pending)
        session.folded_summary = summary
        session.folded_until_id = prefix[-1].id
    return recent, summary


async def _summarize(llm, previous, pending):
    payload = {
        "already": previous,
        "turns": [{"role": message.role, "text": message.text} for message in pending],
    }
    try:
        raw = await llm.complete(
            fold_system(),
            [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
            "fold",
            "text",
        )
    except LLMError:
        logger.warning("fold request failed")
        return local_covered(pending, previous)
    text = clean_reply(raw)
    if len(text) > 900:
        text = text[:900].rsplit(" ", 1)[0].strip()
    if not text or mostly_chinese(text):
        return local_covered(pending, previous)
    return text
