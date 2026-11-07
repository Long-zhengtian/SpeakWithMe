from typing import Optional

from fastapi import APIRouter, Depends

from app.agents import AGENT_SLOTS
from app.api.deps import get_container
from app.api.schemas import CatalogPublic, HealthResponse, HealthSlots, LevelPublic, ProfilePublic
from app.api.schemas import scene_public
from app.domain.levels import LEVELS
from app.domain.profile import build_profile
from app.domain.scenes import list_scenes

router = APIRouter()


def _configured(name):
    # type: (str) -> Optional[str]
    if name in ("", "none"):
        return None
    return name


@router.get("/health", response_model=HealthResponse)
def health(container=Depends(get_container)):
    return HealthResponse(
        status="ok",
        slots=HealthSlots(
            llm=container.llm.name,
            stt=container.stt.name if container.stt is not None else _configured(container.settings.stt_provider),
            tts=container.tts.name if container.tts is not None else _configured(container.settings.tts_provider),
            repository=container.repository.name,
            agents=list(AGENT_SLOTS),
        ),
    )


@router.get("/profile", response_model=ProfilePublic)
def profile(container=Depends(get_container)):
    return ProfilePublic.model_validate(build_profile(container.repository.list_sessions()))


@router.get("/catalog", response_model=CatalogPublic)
def catalog():
    return CatalogPublic(
        levels=[LevelPublic(id=level.id, label_zh=level.label_zh, hint_zh=level.hint_zh) for level in LEVELS],
        scenes=[scene_public(scene) for scene in list_scenes()],
    )
