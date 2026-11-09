import json
import logging

from app.agents.jsonutil import BadJson, complete_json
from app.agents.prompts import correction_system
from app.domain.models import Correction
from app.domain.policy import MAX_CONTEXT_TURNS
from app.providers.openai_compatible import LLMError

logger = logging.getLogger(__name__)


class CorrectionAgent(object):
    name = "correction"

    def __init__(self, llm):
        self.llm = llm

    async def review(self, session, message, level):
        if message.assisted:
            return None
        recent = [
            {"role": item.role, "text": item.text}
            for item in session.messages[-MAX_CONTEXT_TURNS:]
        ]
        payload = {
            "scene_id": session.scene_id,
            "level": session.level,
            "utterance": message.text,
            "assisted": message.assisted,
            "recent_turns": recent,
        }
        try:
            data = await complete_json(
                self.llm,
                correction_system(level),
                [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                self.name,
            )
        except BadJson:
            logger.warning("correction json failed")
            raise LLMError("invalid json")
        except LLMError:
            logger.warning("correction provider failed")
            raise
        return _coerce_correction(data, message.text)


def _coerce_correction(data, utterance):
    raw = data.get("correction")
    if not raw or not isinstance(raw, dict):
        return None
    suggestion = str(raw.get("suggestion") or "").strip()
    if not suggestion:
        return None
    original = utterance.strip() or str(raw.get("original_span") or "").strip()
    category = str(raw.get("category") or "").strip() or "other"
    explanation = str(raw.get("explanation_zh") or "").strip() or "这里可以换一种说法。"
    return Correction(
        original_span=original,
        suggestion=suggestion,
        category=category,
        explanation_zh=explanation,
    )
