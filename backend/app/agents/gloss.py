import json

from app.agents.jsonutil import BadJson, complete_json
from app.agents.prompts import gloss_system
from app.domain.errors import AppError
from app.providers.openai_compatible import LLMError


class GlossAgent(object):
    name = "gloss"

    def __init__(self, llm):
        self.llm = llm

    async def define(self, text):
        try:
            data = await complete_json(
                self.llm,
                gloss_system(),
                [{"role": "user", "content": json.dumps({"text": text}, ensure_ascii=False)}],
                self.name,
            )
        except BadJson:
            data = {}
        except LLMError:
            raise AppError(502, "llm_unavailable", "这个词暂时没有解释，再试一次。")
        gloss = str(data.get("gloss_zh") or "").strip()
        if not gloss:
            raise AppError(502, "empty_gloss", "这个词暂时没有解释，再试一次。")
        return gloss
