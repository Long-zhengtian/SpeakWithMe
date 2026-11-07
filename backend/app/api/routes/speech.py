from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response

from app.api.deps import get_container
from app.api.schemas import SynthesizeBody
from app.domain.errors import AppError

router = APIRouter(prefix="/speech")


@router.post("/transcribe")
async def transcribe(
    container=Depends(get_container),
    file: Optional[UploadFile] = File(default=None),
):
    if container.stt is None:
        raise AppError(501, "slot_empty", "语音识别还没有接入。", slot="stt")
    if file is None:
        raise AppError(422, "missing_audio", "缺少音频文件。")
    audio = await file.read()
    text = await container.stt.transcribe(audio, language="en")
    return {"text": text}


@router.post("/synthesize")
async def synthesize(body: SynthesizeBody, container=Depends(get_container)):
    if container.tts is None:
        raise AppError(501, "slot_empty", "语音合成还没有接入。", slot="tts")
    audio = await container.tts.synthesize(body.text, voice=body.voice)
    return Response(content=audio, media_type="audio/mpeg")
