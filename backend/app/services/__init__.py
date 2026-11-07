from app.agents.chat import ChatAgent
from app.agents.coach import CoachAgent
from app.agents.correction import CorrectionAgent
from app.agents.recap import RecapAgent
from app.dictionary import LocalDictionary
from app.agents.scene import SceneAgent
from app.domain.errors import AppError
from app.domain.levels import get_level
from app.domain.models import Message, Phrase, Session, new_id, now_iso
from app.domain.policy import MAX_INTENT_CHARS, MAX_MESSAGE_CHARS, MAX_USER_TURNS
from app.domain.scenes import get_scene, scene_for
from app.providers.openai_compatible import LLMError


class SessionService(object):
    def __init__(self, repository, llm, dictionary=None):
        self.repository = repository
        self.dictionary = dictionary or LocalDictionary()
        self.chat_agent = ChatAgent(llm)
        self.correction_agent = CorrectionAgent(llm)
        self.coach_agent = CoachAgent(llm)
        self.recap_agent = RecapAgent(llm)
        self.scene_agent = SceneAgent(llm)

    def _require_llm(self):
        if getattr(self.chat_agent.llm, "name", "") == "unconfigured":
            raise AppError(428, "missing_api_key", "先在设置里填上 API key。")

    def use_llm(self, llm):
        self.chat_agent = ChatAgent(llm)
        self.correction_agent = CorrectionAgent(llm)
        self.coach_agent = CoachAgent(llm)
        self.recap_agent = RecapAgent(llm)
        self.scene_agent = SceneAgent(llm)

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

    async def fork_session(self, session_id, through_message_id):
        self._require_llm()
        source = self.get_session(session_id)
        if not source.messages:
            raise AppError(422, "empty_session", "这场还没有可以接着说的句子。")
        marker = (through_message_id or "").strip()
        if marker:
            index = next((i for i, item in enumerate(source.messages) if item.id == marker), None)
            if index is None:
                raise AppError(404, "message_not_found", "这场里没有这句。")
            chosen = source.messages[: index + 1]
        else:
            opening = next((item for item in source.messages if item.role == "assistant"), None)
            if opening is None:
                raise AppError(422, "empty_session", "这场还没有可以接着说的句子。")
            chosen = [opening]
        copied = [self._fresh_message(item) for item in chosen]
        session = Session(
            id=new_id(),
            scene_id=source.scene_id,
            level=source.level,
            created_at=now_iso(),
            corrections_enabled=source.corrections_enabled,
            custom_scene=source.custom_scene,
            messages=copied,
        )
        if copied[-1].role == "user":
            level = get_level(session.level)
            if level is None:
                raise AppError(500, "level_missing", "这场对话的水平丢了。")
            reply_text = await self.chat_agent.reply(session, level)
            session.messages = list(session.messages) + [
                Message(
                    id=new_id(),
                    role="assistant",
                    text=reply_text,
                    assisted=False,
                    correction=None,
                    correction_ready=True,
                )
            ]
        return self.repository.create(session)

    def _fresh_message(self, message):
        return Message(
            id=new_id(),
            role=message.role,
            text=message.text,
            assisted=message.assisted,
            correction=None,
            correction_ready=True,
        )

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
            return None, ""
        if message.correction_ready:
            status = message.correction_status
            if not status and message.correction is not None:
                status = "corrected"
            return message.correction, status
        level = get_level(session.level)
        if level is None:
            raise AppError(500, "level_missing", "这场对话的水平丢了。")
        try:
            correction = await self.correction_agent.review(session, message, level)
        except LLMError:
            failed = message.model_copy(update={"correction": None, "correction_ready": False, "correction_status": "failed"})
            session.messages = [failed if item.id == message_id else item for item in session.messages]
            self.repository.save(session)
            raise AppError(502, "llm_unavailable", "这句指正没有看完，模型调用失败。")
        status = "clear" if correction is None else "corrected"
        updated = message.model_copy(update={"correction": correction, "correction_ready": True, "correction_status": status})
        session.messages = [updated if item.id == message_id else item for item in session.messages]
        self.repository.save(session)
        return correction, status

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

    def gloss(self, text):
        cleaned = (text or "").strip()
        if not cleaned:
            raise AppError(422, "empty_text", "先点一个英语词，或留下一句。")
        if len(cleaned) > 160:
            raise AppError(422, "text_too_long", "短一点，一个词或一句就好。")
        found = self.dictionary.lookup(cleaned)
        if found is None:
            raise AppError(404, "word_not_found", "词典里没有这个词。")
        return found

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
