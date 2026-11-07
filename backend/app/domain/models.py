from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def new_id():
    return uuid4().hex[:16]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class Correction(BaseModel):
    original_span: str
    suggestion: str
    category: str
    explanation_zh: str


class CoachLine(BaseModel):
    sentence: str
    simpler: str
    gloss_zh: str


class Recap(BaseModel):
    went_well: List[str]
    try_next: str
    keep_sentence: str = ""
    revised_from: str = ""


class CustomScene(BaseModel):
    title_zh: str
    description_zh: str
    partner_name: str
    partner_role_zh: str
    partner_role_en: str
    goal_zh: str
    goal_en: str
    opening: str
    clarify_en: str
    rescue_en: str


class LlmSettings(BaseModel):
    provider: str = "openai"
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    api_key: str = ""
    keys: Dict[str, str] = Field(default_factory=dict)
    models: Dict[str, str] = Field(default_factory=dict)
    bases: Dict[str, str] = Field(default_factory=dict)
    model_catalog: Dict[str, List[str]] = Field(default_factory=dict)


class Phrase(BaseModel):
    id: str
    kind: str
    text: str
    gloss_zh: str
    created_at: str


class Message(BaseModel):
    id: str
    role: str
    text: str
    assisted: bool = False
    correction: Optional[Correction] = None
    correction_ready: bool = False


class Session(BaseModel):
    id: str
    scene_id: str
    level: str
    created_at: str
    updated_at: str = ""
    finished_at: Optional[str] = None
    recap: Optional[Recap] = None
    corrections_enabled: bool = True
    custom_scene: Optional[CustomScene] = None
    messages: List[Message] = Field(default_factory=list)
