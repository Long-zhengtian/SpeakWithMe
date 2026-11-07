from app.agents.prompts import chat_system
from app.domain.errors import AppError
from app.domain.policy import ensure_partner_english
from app.domain.scenes import scene_for
from app.providers.openai_compatible import LLMError


class ChatAgent(object):
    name = "chat"

    def __init__(self, llm):
        self.llm = llm

    async def reply(self, session, level):
        scene = scene_for(session)
        if scene is None or level is None:
            raise AppError(500, "scene_missing", "这场对话的场景丢了。")
        messages = [{"role": message.role, "content": message.text} for message in session.messages]
        try:
            raw = await self.llm.complete(
                system=chat_system(scene, level),
                messages=messages,
                task=self.name,
                response_format="text",
            )
        except LLMError:
            raise AppError(502, "llm_unavailable", "聊天暂时没有接上，再试一次。")
        return ensure_partner_english(raw, scene.clarify_en)
