import json

from app.agents.jsonutil import parse_json_object
from app.agents.prompts import gloss_system
from app.domain.errors import AppError
from app.providers.openai_compatible import LLMError


class GlossAgent(object):
    name = "gloss"

    def __init__(self, llm):
        self.llm = llm

    async def define(self, text):
        try:
            raw = await self.llm.complete(
                system=gloss_system(),
                messages=[{"role": "user", "content": json.dumps({"text": text}, ensure_ascii=False)}],
                task=self.name,
                response_format="json",
            )
        except LLMError:
            raise AppError(502, "llm_unavailable", "这个词暂时没有解释，再试一次。")
        data = parse_json_object(raw)
        gloss = str(data.get("gloss_zh") or "").strip()
        if not gloss:
            raise AppError(502, "empty_gloss", "这个词暂时没有解释，再试一次。")
        return gloss
