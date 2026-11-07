from app.persistence import build_repository
from app.providers import build_llm, build_stt, build_tts
from app.services import SessionService


class Container(object):
    def __init__(self, settings, llm, repository, sessions, stt, tts):
        self.settings = settings
        self.llm = llm
        self.repository = repository
        self.sessions = sessions
        self.stt = stt
        self.tts = tts

    def apply_llm_settings(self, record):
        key = (record.api_key or "").strip()
        model = (record.model or "").strip()
        provider = "openai_compatible" if key and model else "unconfigured"
        if provider == "unconfigured":
            key = ""
        base_url = (record.base_url or "https://api.openai.com/v1").rstrip("/")
        model = model or "gpt-4o-mini"
        self.settings = self.settings.with_llm(provider, base_url, key, model)
        self.llm = build_llm(self.settings)
        self.sessions.use_llm(self.llm)


def apply_stored_llm(container):
    stored = container.repository.get_llm_settings()
    if stored is not None:
        container.apply_llm_settings(stored)
    return container


def build_container(settings):
    llm = build_llm(settings)
    repository = build_repository(settings)
    return Container(
        settings=settings,
        llm=llm,
        repository=repository,
        sessions=SessionService(repository, llm),
        stt=build_stt(settings),
        tts=build_tts(settings),
    )
