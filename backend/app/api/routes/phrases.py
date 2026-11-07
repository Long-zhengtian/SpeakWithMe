from typing import List

from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.api.schemas import GlossBody, GlossPublic, SavePhraseBody
from app.domain.models import Phrase

router = APIRouter()


@router.post("/glossary", response_model=GlossPublic)
def glossary(body: GlossBody, container=Depends(get_container)):
    return container.sessions.gloss(body.text)


@router.get("/phrases", response_model=List[Phrase])
def list_phrases(container=Depends(get_container)):
    return container.sessions.list_phrases()


@router.post("/phrases", response_model=Phrase)
def save_phrase(body: SavePhraseBody, container=Depends(get_container)):
    return container.sessions.save_phrase(body.text, body.gloss_zh, body.kind)


@router.delete("/phrases/{phrase_id}")
def delete_phrase(phrase_id: str, container=Depends(get_container)):
    container.sessions.delete_phrase(phrase_id)
    return {"ok": True}
