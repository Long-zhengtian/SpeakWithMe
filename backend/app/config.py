import os
from pathlib import Path

from dotenv import load_dotenv


def _load_env_files():
    here = Path(__file__).resolve()
    candidates = (
        Path.cwd() / ".env",
        here.parents[2] / ".env",
        here.parents[3] / ".env",
    )
    for candidate in candidates:
        if candidate.exists():
            load_dotenv(candidate, override=False)


class Settings(object):
    def __init__(
        self,
        llm_provider,
        llm_base_url,
        llm_api_key,
        llm_model,
        llm_correction_model,
        llm_coach_model,
        stt_provider,
        tts_provider,
        cors_origins,
        repository,
        data_path,
    ):
        self.llm_provider = llm_provider
        self.llm_base_url = llm_base_url
        self.llm_api_key = llm_api_key
        self.llm_model = llm_model
        self.llm_correction_model = llm_correction_model
        self.llm_coach_model = llm_coach_model
        self.stt_provider = stt_provider
        self.tts_provider = tts_provider
        self.cors_origins = cors_origins
        self.repository = repository
        self.data_path = data_path

    def with_llm(self, provider, base_url, api_key, model):
        return Settings(
            llm_provider=provider,
            llm_base_url=base_url,
            llm_api_key=api_key,
            llm_model=model,
            llm_correction_model="",
            llm_coach_model="",
            stt_provider=self.stt_provider,
            tts_provider=self.tts_provider,
            cors_origins=self.cors_origins,
            repository=self.repository,
            data_path=self.data_path,
        )

    @classmethod
    def for_tests(cls):
        return cls(
            llm_provider="mock",
            llm_base_url="http://localhost",
            llm_api_key="",
            llm_model="mock",
            llm_correction_model="",
            llm_coach_model="",
            stt_provider="none",
            tts_provider="none",
            cors_origins=("http://localhost:5173",),
            repository="memory",
            data_path="",
        )

    @classmethod
    def from_env(cls):
        _load_env_files()
        api_key = os.getenv("LLM_API_KEY", "").strip()
        provider = os.getenv("LLM_PROVIDER", "auto").strip() or "auto"
        if provider == "auto":
            provider = "openai_compatible" if api_key else "unconfigured"
        origins = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        )
        data_path = os.getenv("DATA_PATH", "").strip()
        if not data_path:
            data_path = str(Path(__file__).resolve().parents[1] / "data" / "speaking.sqlite")
        return cls(
            llm_provider=provider,
            llm_base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
            llm_api_key=api_key,
            llm_model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
            llm_correction_model=os.getenv("LLM_CORRECTION_MODEL", "").strip(),
            llm_coach_model=os.getenv("LLM_COACH_MODEL", "").strip(),
            stt_provider=os.getenv("STT_PROVIDER", "none").strip() or "none",
            tts_provider=os.getenv("TTS_PROVIDER", "none").strip() or "none",
            cors_origins=tuple(item.strip() for item in origins.split(",") if item.strip()),
            repository=os.getenv("REPOSITORY", "sqlite").strip() or "sqlite",
            data_path=data_path,
        )
