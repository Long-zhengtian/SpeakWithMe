from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.api.schemas import (
    CoachBody,
    CorrectionResponse,
    CreateSessionBody,
    SendMessageBody,
    SendMessageResponse,
    SessionPublic,
    message_public,
    session_public,
)
from app.domain.models import CoachLine, Recap

router = APIRouter(prefix="/sessions")


@router.post("", response_model=SessionPublic)
async def create_session(body: CreateSessionBody, container=Depends(get_container)):
    session = await container.sessions.create_session(
        body.scene_id,
        body.level,
        body.situation_zh,
        body.corrections_enabled,
    )
    return session_public(session)


@router.get("/{session_id}", response_model=SessionPublic)
def read_session(session_id: str, container=Depends(get_container)):
    session = container.sessions.get_session(session_id)
    return session_public(session)


@router.post("/{session_id}/messages", response_model=SendMessageResponse)
async def send_message(session_id: str, body: SendMessageBody, container=Depends(get_container)):
    user_message, assistant_message = await container.sessions.send_message(
        session_id, body.text, body.assisted
    )
    return SendMessageResponse(
        user_message=message_public(user_message),
        assistant_message=message_public(assistant_message),
    )


@router.post("/{session_id}/messages/{message_id}/correction", response_model=CorrectionResponse)
async def correct_message(session_id: str, message_id: str, container=Depends(get_container)):
    correction = await container.sessions.correct_message(session_id, message_id)
    return CorrectionResponse(message_id=message_id, correction=correction)


@router.post("/{session_id}/coach", response_model=CoachLine)
async def coach(session_id: str, body: CoachBody, container=Depends(get_container)):
    return await container.sessions.coach(session_id, body.intent_zh, body.variant)


@router.post("/{session_id}/recap", response_model=Recap)
async def recap(session_id: str, container=Depends(get_container)):
    return await container.sessions.summarize(session_id)
