import json
import logging

from app.domain.policy import JSON_ATTEMPTS

logger = logging.getLogger(__name__)


class BadJson(Exception):
    pass


def parse_json_object(raw):
    try:
        return parse_json_object_strict(raw)
    except BadJson:
        return {}


def parse_json_object_strict(raw):
    text = (raw or "").strip()
    if not text:
        raise BadJson("empty")
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise BadJson("not json")
        try:
            value = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            raise BadJson("not json")
    if not isinstance(value, dict):
        raise BadJson("not object")
    return value


async def complete_json(llm, system, messages, task, attempts=JSON_ATTEMPTS):
    """One fresh POST per attempt. A bad object is sent back once and asked again."""
    last = BadJson("empty")
    for attempt in range(attempts):
        raw = await llm.complete(system, messages if attempt == 0 else _repair(messages, raw), task, "json")
        try:
            return parse_json_object_strict(raw)
        except BadJson as exc:
            last = exc
            logger.warning("json parse failed task=%s attempt=%s", task, attempt + 1)
    raise last


def _repair(messages, raw):
    return list(messages) + [
        {"role": "assistant", "content": (raw or "")[:2000]},
        {"role": "user", "content": "That was not a JSON object. Return one JSON object only, with no other text."},
    ]
