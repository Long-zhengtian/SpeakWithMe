"""One file that carries practice to another computer or phone.

Echo Loop keeps learning rows in the app database and restores them from a
backup. Joplin does the same with a JEX file: import updates matching ids and
leaves local rows the file does not mention. This file is that backup.
"""

from pydantic import ValidationError

from app.domain.errors import AppError
from app.domain.models import LlmSettings, Phrase, Session, now_iso

BACKUP_FORMAT = "speak-with-me-backup"
BACKUP_VERSION = 1


def export_backup(repository):
    settings = repository.get_llm_settings()
    return {
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "exported_at": now_iso(),
        "sessions": [session.model_dump(mode="json") for session in repository.list_sessions()],
        "phrases": [phrase.model_dump(mode="json") for phrase in repository.list_phrases()],
        "settings": settings.model_dump(mode="json") if settings is not None else None,
    }


def import_backup(repository, payload):
    sessions, phrases, settings = _read_backup(payload)
    for session in sessions:
        repository.replace_session(session)
    for phrase in phrases:
        repository.save_phrase(phrase)
    if settings is not None:
        repository.save_llm_settings(settings)
    return {"sessions": len(sessions), "phrases": len(phrases), "settings": settings is not None}


def _read_backup(payload):
    if not isinstance(payload, dict) or payload.get("format") != BACKUP_FORMAT:
        raise AppError(422, "bad_backup", "这不是一份练习备份。")
    if payload.get("version") != BACKUP_VERSION:
        raise AppError(422, "bad_backup", "这份备份的版本读不了。")
    sessions_raw = payload.get("sessions", [])
    phrases_raw = payload.get("phrases", [])
    if not isinstance(sessions_raw, list) or not isinstance(phrases_raw, list):
        raise AppError(422, "bad_backup", "这份备份里有读不了的内容。")
    settings_raw = payload.get("settings", None)
    if settings_raw is not None and not isinstance(settings_raw, dict):
        raise AppError(422, "bad_backup", "这份备份里有读不了的内容。")
    try:
        sessions = [Session.model_validate(item) for item in sessions_raw]
        phrases = [Phrase.model_validate(item) for item in phrases_raw]
        settings = LlmSettings.model_validate(settings_raw) if settings_raw is not None else None
    except ValidationError:
        raise AppError(422, "bad_backup", "这份备份里有读不了的内容。")
    return sessions, phrases, settings
