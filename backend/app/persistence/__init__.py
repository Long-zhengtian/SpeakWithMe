from app.domain.models import now_iso
from app.persistence.sqlite import SqliteSessionRepository
from app.ports.repository import SessionRepository


class MemorySessionRepository(SessionRepository):
    name = "memory"

    def __init__(self):
        self._items = {}
        self._phrases = {}
        self._llm_settings = None

    def create(self, session):
        return self.save(session)

    def get(self, session_id):
        return self._items.get(session_id)

    def save(self, session):
        session.updated_at = now_iso()
        self._items[session.id] = session
        return session

    def replace_session(self, session):
        if not session.updated_at:
            session.updated_at = now_iso()
        self._items[session.id] = session
        return session

    def list_sessions(self):
        return sorted(self._items.values(), key=lambda session: session.updated_at, reverse=True)

    def delete_session(self, session_id):
        return self._items.pop(session_id, None) is not None

    def list_phrases(self):
        return sorted(self._phrases.values(), key=lambda phrase: phrase.created_at, reverse=True)

    def find_phrase(self, text, kind):
        folded = text.casefold()
        for phrase in self._phrases.values():
            if phrase.kind == kind and phrase.text.casefold() == folded:
                return phrase
        return None

    def save_phrase(self, phrase):
        self._phrases[phrase.id] = phrase
        return phrase

    def delete_phrase(self, phrase_id):
        return self._phrases.pop(phrase_id, None) is not None

    def get_llm_settings(self):
        return self._llm_settings

    def save_llm_settings(self, settings):
        self._llm_settings = settings
        return settings


def build_repository(settings):
    if settings.repository == "memory":
        return MemorySessionRepository()
    if settings.repository == "sqlite":
        return SqliteSessionRepository(settings.data_path)
    raise RuntimeError("Unknown REPOSITORY %s. Registered: memory, sqlite" % settings.repository)
