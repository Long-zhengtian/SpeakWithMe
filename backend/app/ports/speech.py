class SpeechToText(object):
    """Transcribe learner audio. Register an instance in STT_BUILDERS."""

    name = ""

    async def transcribe(self, audio, language):
        # type: (bytes, str) -> str
        raise NotImplementedError


class TextToSpeech(object):
    """Synthesize partner or model-sentence audio. Register it in TTS_BUILDERS."""

    name = ""

    async def synthesize(self, text, voice):
        # type: (str, str) -> bytes
        raise NotImplementedError
