import json

from app.agents.jsonutil import parse_json_object
from app.agents.prompts import coach_system
from app.domain.errors import AppError
from app.domain.models import CoachLine
from app.providers.openai_compatible import LLMError


class CoachAgent(object):
    name = "coach"

    def __init__(self, llm):
        self.llm = llm

    async def suggest(self, session, level, scene, intent_zh, variant):
        partner_last = ""
        for message in reversed(session.messages):
            if message.role == "assistant":
                partner_last = message.text
                break
        payload = {
            "scene_id": scene.id,
            "level": session.level,
            "partner_last": partner_last,
            "intent_zh": intent_zh,
            "variant": variant,
        }
        try:
            raw = await self.llm.complete(
                system=coach_system(scene, level),
                messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                task=self.name,
                response_format="json",
            )
        except LLMError:
            raise AppError(502, "llm_unavailable", "这句话暂时没组织好，再试一次。")
        data = parse_json_object(raw)
        sentence = str(data.get("sentence") or "").strip()
        if not sentence:
            raise AppError(502, "coach_empty", "没有得到能说的句子，再试一次。")
        simpler = str(data.get("simpler") or "").strip() or sentence
        gloss = str(data.get("gloss_zh") or "").strip() or "用这句接上对话。"
        return CoachLine(sentence=sentence, simpler=simpler, gloss_zh=gloss)
