import json

from app.agents.jsonutil import parse_json_object
from app.agents.prompts import recap_system
from app.domain.errors import AppError
from app.domain.models import Recap
from app.providers.openai_compatible import LLMError


class RecapAgent(object):
    name = "recap"

    def __init__(self, llm):
        self.llm = llm

    async def summarize(self, session):
        turns = []
        for message in session.messages:
            item = {
                "role": message.role,
                "text": message.text,
                "assisted": message.assisted,
            }
            if message.correction is not None:
                item["correction"] = message.correction.model_dump()
            turns.append(item)
        payload = {"scene_id": session.scene_id, "level": session.level, "turns": turns}
        try:
            raw = await self.llm.complete(
                system=recap_system(),
                messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                task=self.name,
                response_format="json",
            )
        except LLMError:
            raise AppError(502, "llm_unavailable", "小结暂时没有生成，再试一次。")
        data = parse_json_object(raw)
        went = data.get("went_well")
        if not isinstance(went, list):
            went = []
        went_well = [str(item).strip() for item in went if str(item).strip()][:3]
        if not went_well:
            went_well = ["这场对话接上了。"]
        try_next = str(data.get("try_next") or "").strip() or "下一场继续用短句把事情说完。"
        keep_sentence = str(data.get("keep_sentence") or "").strip()
        revised_from = str(data.get("revised_from") or "").strip()
        return Recap(
            went_well=went_well,
            try_next=try_next,
            keep_sentence=keep_sentence,
            revised_from=revised_from,
        )
