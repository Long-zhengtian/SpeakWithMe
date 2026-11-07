from app.agents.chat import ChatAgent
from app.agents.coach import CoachAgent
from app.agents.correction import CorrectionAgent
from app.agents.gloss import GlossAgent
from app.agents.recap import RecapAgent
from app.agents.scene import SceneAgent
from app.domain.errors import AppError
from app.domain.levels import get_level
from app.domain.models import Message, Phrase, Session, new_id, now_iso
from app.domain.policy import MAX_INTENT_CHARS, MAX_MESSAGE_CHARS, MAX_USER_TURNS
from app.domain.scenes import get_scene, scene_for


class SessionService(object):
    def __init__(self, repository, llm):
        self.repository = repository
        self.chat_agent = ChatAgent(llm)
        self.correction_agent = CorrectionAgent(llm)
        self.coach_agent = CoachAgent(llm)
        self.recap_agent = RecapAgent(llm)
        self.scene_agent = SceneAgent(llm)
        self.gloss_agent = GlossAgent(llm)

    def _require_llm(self):
        if getattr(self.chat_agent.llm, "name", "") == "unconfigured":
            raise AppError(428, "missing_api_key", "先在设置里填上 API key。")

    def use_llm(self, llm):
        self.chat_agent = ChatAgent(llm)
        self.correction_agent = CorrectionAgent(llm)
        self.coach_agent = CoachAgent(llm)
        self.recap_agent = RecapAgent(llm)
        self.scene_agent = SceneAgent(llm)
        self.gloss_agent = GlossAgent(llm)

    async def create_session(self, scene_id, level_id, situation_zh, corrections_enabled):
        self._require_llm()
        level = get_level(level_id)
        if level is None:
            raise AppError(422, "invalid_level", "水平只能是目录里列出的等级。")
        situation = (situation_zh or "").strip()
        custom = None
        if situation:
            if len(situation) > 200:
                raise AppError(422, "situation_too_long", "短一点，说清这场在什么处境就好。")
            custom = await self.scene_agent.build(situation, level)
            chosen_id = "custom"
            opening = custom.opening
        else:
            scene = get_scene(scene_id)
            if scene is None:
                raise AppError(404, "scene_not_found", "没有这个场景。")
            chosen_id = scene.id
            opening = scene.opening
        session = Session(
            id=new_id(),
            scene_id=chosen_id,
            level=level_id,
            created_at=now_iso(),
            corrections_enabled=bool(corrections_enabled),
            custom_scene=custom,
            messages=[
                Message(
                    id=new_id(),
                    role="assistant",
                    text=opening,
                    assisted=False,
                    correction=None,
                    correction_ready=True,
                )
            ],
        )
        return self.repository.create(session)

    def get_session(self, session_id):
        session = self.repository.get(session_id)
        if session is None:
            raise AppError(404, "session_not_found", "这场对话不在记录里。")
        return session

    async def send_message(self, session_id, text, assisted):
        self._require_llm()
        session = self.get_session(session_id)
        level = get_level(session.level)
        if level is None:
            raise AppError(500, "level_missing", "这场对话的水平丢了。")
        cleaned = (text or "").strip()
        if not cleaned:
            raise AppError(422, "empty_message", "先写一句再发送。")
        if len(cleaned) > MAX_MESSAGE_CHARS:
            raise AppError(422, "message_too_long", "这句话太长了，缩短一点。")
        user_turns = sum(1 for message in session.messages if message.role == "user")
        if user_turns >= MAX_USER_TURNS:
            raise AppError(409, "session_full", "这场已经够长了，先结束再开一场。")
        user_message = Message(
            id=new_id(),
            role="user",
            text=cleaned,
            assisted=bool(assisted),
            correction=None,
            correction_ready=bool(assisted) or not session.corrections_enabled,
        )
        draft = session.model_copy(update={"messages": list(session.messages) + [user_message]})
        reply_text = await self.chat_agent.reply(draft, level)
        assistant = Message(
            id=new_id(),
            role="assistant",
            text=reply_text,
            assisted=False,
            correction=None,
            correction_ready=True,
        )
        saved = draft.model_copy(update={"messages": list(draft.messages) + [assistant]})
        self.repository.save(saved)
        return user_message, assistant

    async def correct_message(self, session_id, message_id):
        self._require_llm()
        session = self.get_session(session_id)
        message = next((item for item in session.messages if item.id == message_id), None)
        if message is None:
            raise AppError(404, "message_not_found", "找不到这句。")
        if message.role != "user":
            raise AppError(400, "not_user_message", "只指正你说的话。")
        if not session.corrections_enabled:
            updated = message.model_copy(update={"correction_ready": True})
            session.messages = [updated if item.id == message_id else item for item in session.messages]
            self.repository.save(session)
            return None
        if message.correction_ready:
            return message.correction
        level = get_level(session.level)
        if level is None:
            raise AppError(500, "level_missing", "这场对话的水平丢了。")
        correction = await self.correction_agent.review(session, message, level)
        updated = message.model_copy(update={"correction": correction, "correction_ready": True})
        session.messages = [updated if item.id == message_id else item for item in session.messages]
        self.repository.save(session)
        return correction

    async def coach(self, session_id, intent_zh, variant):
        self._require_llm()
        session = self.get_session(session_id)
        scene = scene_for(session)
        level = get_level(session.level)
        if scene is None or level is None:
            raise AppError(500, "scene_missing", "这场对话的场景丢了。")
        intent = (intent_zh or "").strip()
        if not intent:
            raise AppError(422, "empty_intent", "先用中文写下你想说的意思。")
        if len(intent) > MAX_INTENT_CHARS:
            raise AppError(422, "intent_too_long", "短一点就好，说清你想表达的意思。")
        return await self.coach_agent.suggest(session, level, scene, intent, int(variant or 0))

    async def summarize(self, session_id):
        self._require_llm()
        session = self.get_session(session_id)
        recap = await self.recap_agent.summarize(session)
        session.recap = recap
        session.finished_at = now_iso()
        self.repository.save(session)
        return recap

    async def gloss(self, text):
        self._require_llm()
        cleaned = (text or "").strip()
        if not cleaned:
            raise AppError(422, "empty_text", "先点一个英语词，或留下一句。")
        if len(cleaned) > 160:
            raise AppError(422, "text_too_long", "短一点，一个词或一句就好。")
        gloss_zh = await self.gloss_agent.define(cleaned)
        return {"text": cleaned, "gloss_zh": gloss_zh}

    def list_phrases(self):
        return self.repository.list_phrases()

    def save_phrase(self, text, gloss_zh, kind):
        cleaned = (text or "").strip()
        gloss = (gloss_zh or "").strip()
        phrase_kind = kind if kind in ("word", "sentence") else ""
        if not cleaned or not gloss or not phrase_kind:
            raise AppError(422, "invalid_phrase", "要留下的句子不完整。")
        if len(cleaned) > 160 or len(gloss) > 80:
            raise AppError(422, "phrase_too_long", "这句太长了，缩短一点再收下。")
        existing = self.repository.find_phrase(cleaned, phrase_kind)
        if existing is not None:
            return existing
        phrase = Phrase(
            id=new_id(),
            kind=phrase_kind,
            text=cleaned,
            gloss_zh=gloss,
            created_at=now_iso(),
        )
        return self.repository.save_phrase(phrase)

    def delete_phrase(self, phrase_id):
        if not self.repository.delete_phrase(phrase_id):
            raise AppError(404, "phrase_not_found", "句型本里没有这一条。")
