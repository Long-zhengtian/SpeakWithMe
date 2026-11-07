from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.api.schemas import LlmSettingsPublic, LlmSettingsUpdate, LlmTestPublic
from app.services.llm_config import current_record, list_provider_models, public_view, save_record, test_record

router = APIRouter()


@router.get("/settings", response_model=LlmSettingsPublic)
def read_settings(container=Depends(get_container)):
    return public_view(current_record(container))


@router.put("/settings", response_model=LlmSettingsPublic)
def update_settings(body: LlmSettingsUpdate, container=Depends(get_container)):
    return save_record(container, body)


@router.post("/settings/models", response_model=LlmSettingsPublic)
async def read_provider_models(body: LlmSettingsUpdate, container=Depends(get_container)):
    return await list_provider_models(container, body)


@router.post("/settings/test", response_model=LlmTestPublic)
async def test_settings(body: LlmSettingsUpdate, container=Depends(get_container)):
    return await test_record(container, body)
