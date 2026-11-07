from app.providers.mock_llm import MockLLM
from app.providers.openai_compatible import LLMError, OpenAICompatibleLLM


class UnconfiguredLLM(object):
    """Used until a key is saved. The app does not invent a stand-in partner."""

    name = "unconfigured"

    async def complete(self, system, messages, task, response_format):
        raise LLMError("missing api key")


def _build_openai(settings):
    if not settings.llm_api_key:
        raise RuntimeError("LLM_API_KEY is required when LLM_PROVIDER=openai_compatible")
    return OpenAICompatibleLLM(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        chat_model=settings.llm_model,
        correction_model=settings.llm_correction_model,
        coach_model=settings.llm_coach_model,
    )


# Add a provider by registering a builder: (Settings) -> LLMProvider.
LLM_BUILDERS = {
    "mock": lambda settings: MockLLM(),
    "openai_compatible": _build_openai,
    "unconfigured": lambda settings: UnconfiguredLLM(),
}

# Implement SpeechToText / TextToSpeech, then register the instance factory here.
STT_BUILDERS = {}
TTS_BUILDERS = {}


def build_llm(settings):
    builder = LLM_BUILDERS.get(settings.llm_provider)
    if builder is None:
        known = ", ".join(sorted(LLM_BUILDERS))
        raise RuntimeError("Unknown LLM_PROVIDER %s. Registered: %s" % (settings.llm_provider, known))
    return builder(settings)


def _build_optional(name, builders, label):
    if name in ("", "none"):
        return None
    builder = builders.get(name)
    if builder is None:
        known = ", ".join(sorted(builders)) or "none yet"
        raise RuntimeError("Unknown %s provider %s. Registered: %s" % (label, name, known))
    return builder()


def build_stt(settings):
    return _build_optional(settings.stt_provider, STT_BUILDERS, "STT")


def build_tts(settings):
    return _build_optional(settings.tts_provider, TTS_BUILDERS, "TTS")
