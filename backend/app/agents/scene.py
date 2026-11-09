import json

from app.agents.jsonutil import BadJson, complete_json
from app.agents.prompts import scene_system
from app.domain.errors import AppError
from app.domain.models import CustomScene
from app.providers.openai_compatible import LLMError


class SceneAgent(object):
    name = "scene"

    def __init__(self, llm):
        self.llm = llm

    async def build(self, situation_zh, level):
        payload = {"situation_zh": situation_zh, "level": level.id}
        try:
            data = await complete_json(
                self.llm,
                scene_system(),
                [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                self.name,
            )
        except BadJson:
            data = {}
        except LLMError:
            raise AppError(502, "llm_unavailable", "这场场景暂时没有准备好，再试一次。")
        opening = str(data.get("opening") or "").strip() or "Hi. What happened?"
        return CustomScene(
            title_zh=str(data.get("title_zh") or "").strip() or "自己的一场",
            description_zh=str(data.get("description_zh") or "").strip() or situation_zh,
            partner_name=str(data.get("partner_name") or "").strip() or "Alex",
            partner_role_zh=str(data.get("partner_role_zh") or "").strip() or "对方",
            partner_role_en=str(data.get("partner_role_en") or "").strip() or "the other person in this situation",
            goal_zh=str(data.get("goal_zh") or "").strip() or "把这件事说清楚。",
            goal_en=str(data.get("goal_en") or "").strip() or "Help the learner explain the situation in simple English.",
            opening=opening,
            clarify_en=str(data.get("clarify_en") or "").strip() or "Sorry, could you say that more simply?",
            rescue_en=str(data.get("rescue_en") or "").strip() or "Could you help me, please?",
        )
