from typing import List, Optional

from pydantic import BaseModel, Field

from app.domain.models import Correction, Recap
from app.domain.scenes import scene_for


class LevelPublic(BaseModel):
    id: str
    label_zh: str
    hint_zh: str


class ScenePublic(BaseModel):
    id: str
    title: str
    title_zh: str
    description_zh: str
    partner_name: str
    partner_role_zh: str
    goal_zh: str
    opening: str


class MessagePublic(BaseModel):
    id: str
    role: str
    text: str
    assisted: bool
    correction: Optional[Correction] = None
    correction_status: str = ""


class SessionPublic(BaseModel):
    id: str
    level: str
    scene: ScenePublic
    messages: List[MessagePublic]
    finished_at: Optional[str] = None
    recap: Optional[Recap] = None
    corrections_enabled: bool = True


class CatalogPublic(BaseModel):
    levels: List[LevelPublic]
    scenes: List[ScenePublic]


class CreateSessionBody(BaseModel):
    scene_id: str = Field(default="", max_length=64)
    level: str = Field(min_length=1, max_length=16)
    situation_zh: str = Field(default="", max_length=200)
    corrections_enabled: bool = True


class ForkBody(BaseModel):
    through_message_id: str = ""


class RenameBody(BaseModel):
    title_zh: str = Field(min_length=1, max_length=40)


class SendMessageBody(BaseModel):
    text: str = Field(min_length=1, max_length=800)
    assisted: bool = False


class SendMessageResponse(BaseModel):
    user_message: MessagePublic
    assistant_message: MessagePublic


class CorrectionResponse(BaseModel):
    message_id: str
    correction: Optional[Correction] = None
    correction_status: str = ""


class CoachBody(BaseModel):
    intent_zh: str = Field(min_length=1, max_length=400)
    variant: int = Field(default=0, ge=0, le=6)


class SynthesizeBody(BaseModel):
    text: str = Field(min_length=1, max_length=800)
    voice: str = Field(default="partner", max_length=64)


class HealthSlots(BaseModel):
    llm: str
    stt: Optional[str] = None
    tts: Optional[str] = None
    repository: str
    agents: List[str]


class HealthResponse(BaseModel):
    status: str
    slots: HealthSlots


def message_public(message):
    return MessagePublic(
        id=message.id,
        role=message.role,
        text=message.text,
        assisted=message.assisted,
        correction=message.correction,
        correction_status=message.correction_status,
    )


def scene_public(scene):
    return ScenePublic(
        id=scene.id,
        title=scene.title,
        title_zh=scene.title_zh,
        description_zh=scene.description_zh,
        partner_name=scene.partner_name,
        partner_role_zh=scene.partner_role_zh,
        goal_zh=scene.goal_zh,
        opening=scene.opening,
    )


class ProfileStats(BaseModel):
    sessions: int
    user_turns: int
    corrections: int
    assisted_turns: int


class FocusItem(BaseModel):
    category: str
    label_zh: str
    count: int


class CorrectionNote(BaseModel):
    suggestion: str
    explanation_zh: str
    category: str
    label_zh: str
    scene_title_zh: str


class FeedbackNote(BaseModel):
    scene_title_zh: str
    finished_at: str
    went_well: List[str]
    try_next: str
    keep_sentence: str = ""
    revised_from: str = ""


class ScoreDimension(BaseModel):
    id: str
    label_zh: str
    score: int


class SessionScore(BaseModel):
    total: int
    dimensions: List[ScoreDimension]


class DayScore(BaseModel):
    date: str
    label: str
    today: bool = False
    sessions: int = 0
    turns: int = 0
    score: Optional[int] = None
    summary: str = ""
    dimensions: List[ScoreDimension] = Field(default_factory=list)


class ProgressPublic(BaseModel):
    streak: int = 0
    best: int = 0
    practice_days: int = 0
    spoke_today: bool = False
    days: List[DayScore] = Field(default_factory=list)


class PracticeRecord(BaseModel):
    id: str
    scene_title_zh: str
    partner_name: str
    level: str
    created_at: str
    finished_at: Optional[str] = None
    user_turns: int
    correction_count: int
    assisted_turns: int
    try_next: Optional[str] = None
    preview: str
    score: Optional[SessionScore] = None


class ActivityPoint(BaseModel):
    at: str


class ProfilePublic(BaseModel):
    stats: ProfileStats
    focus: List[FocusItem]
    recent_corrections: List[CorrectionNote]
    latest_feedback: Optional[FeedbackNote] = None
    records: List[PracticeRecord]
    activity: List[ActivityPoint] = Field(default_factory=list)
    progress: ProgressPublic = Field(default_factory=ProgressPublic)


class GlossBody(BaseModel):
    text: str = Field(min_length=1, max_length=160)


class GlossPublic(BaseModel):
    text: str
    gloss_zh: str
    phonetic: str = ""
    definitions: List[str] = Field(default_factory=list)
    lemma: str = ""


class ProviderPublic(BaseModel):
    id: str
    label: str
    base_url: str
    model: str
    custom_url: bool = False
    api_key_set: bool
    api_key_hint: str = ""
    models: List[str] = Field(default_factory=list)


class LlmSettingsPublic(BaseModel):
    provider: str
    base_url: str
    model: str
    api_key_set: bool
    api_key_hint: str = ""
    providers: List[ProviderPublic]


class LlmSettingsUpdate(BaseModel):
    provider: str = "openai"
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    clear_api_key: bool = False


class LlmTestPublic(BaseModel):
    ok: bool
    message: str


class SavePhraseBody(BaseModel):
    text: str = Field(min_length=1, max_length=160)
    gloss_zh: str = Field(min_length=1, max_length=80)
    kind: str = Field(min_length=1, max_length=16)


class PhraseStatusBody(BaseModel):
    learning_status: str = Field(min_length=1, max_length=16)


class BackupImportResult(BaseModel):
    sessions: int
    phrases: int
    settings: bool


def session_public(session):
    scene = scene_public(scene_for(session))
    title = (session.title_zh or "").strip()
    if title:
        scene = scene.model_copy(update={"title_zh": title, "title": title})
    return SessionPublic(
        id=session.id,
        level=session.level,
        scene=scene,
        messages=[message_public(message) for message in session.messages],
        finished_at=session.finished_at,
        recap=session.recap,
        corrections_enabled=session.corrections_enabled,
    )
