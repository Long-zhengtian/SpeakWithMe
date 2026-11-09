import sqlite3
from pathlib import Path
from threading import Lock

from app.domain.models import LlmSettings, Phrase, Session, now_iso
from app.ports.repository import SessionRepository


class SqliteSessionRepository(SessionRepository):
    """Local practice records. Swap this class if a shared database is needed."""

    name = "sqlite"

    def __init__(self, path):
        self.path = path
        self._lock = Lock()
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        connection = self._connect()
        try:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS phrases (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS app_settings (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                )
                """
            )
            connection.commit()
        finally:
            connection.close()

    def _connect(self):
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _read(self, query, params=()):
        with self._lock:
            connection = self._connect()
            try:
                return connection.execute(query, params).fetchall()
            finally:
                connection.close()

    def create(self, session):
        return self.save(session)

    def get(self, session_id):
        rows = self._read("SELECT payload FROM sessions WHERE id = ?", (session_id,))
        if not rows:
            return None
        return Session.model_validate_json(rows[0]["payload"])

    def save(self, session):
        session.updated_at = now_iso()
        payload = session.model_dump_json()
        with self._lock:
            connection = self._connect()
            try:
                connection.execute(
                    """
                    INSERT INTO sessions (id, updated_at, payload)
                    VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        updated_at = excluded.updated_at,
                        payload = excluded.payload
                    """,
                    (session.id, session.updated_at, payload),
                )
                connection.commit()
            finally:
                connection.close()
        return session

    def replace_session(self, session):
        if not session.updated_at:
            session.updated_at = now_iso()
        payload = session.model_dump_json()
        with self._lock:
            connection = self._connect()
            try:
                connection.execute(
                    """
                    INSERT INTO sessions (id, updated_at, payload)
                    VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        updated_at = excluded.updated_at,
                        payload = excluded.payload
                    """,
                    (session.id, session.updated_at, payload),
                )
                connection.commit()
            finally:
                connection.close()
        return session

    def list_sessions(self):
        rows = self._read("SELECT payload FROM sessions ORDER BY updated_at DESC")
        return [Session.model_validate_json(row["payload"]) for row in rows]

    def delete_session(self, session_id):
        with self._lock:
            connection = self._connect()
            try:
                cursor = connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
                connection.commit()
                return cursor.rowcount > 0
            finally:
                connection.close()

    def list_phrases(self):
        rows = self._read("SELECT payload FROM phrases ORDER BY created_at DESC")
        return [Phrase.model_validate_json(row["payload"]) for row in rows]

    def find_phrase(self, text, kind):
        folded = text.casefold()
        for phrase in self.list_phrases():
            if phrase.kind == kind and phrase.text.casefold() == folded:
                return phrase
        return None

    def save_phrase(self, phrase):
        payload = phrase.model_dump_json()
        with self._lock:
            connection = self._connect()
            try:
                connection.execute(
                    """
                    INSERT INTO phrases (id, created_at, payload)
                    VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        created_at = excluded.created_at,
                        payload = excluded.payload
                    """,
                    (phrase.id, phrase.created_at, payload),
                )
                connection.commit()
            finally:
                connection.close()
        return phrase

    def delete_phrase(self, phrase_id):
        with self._lock:
            connection = self._connect()
            try:
                cursor = connection.execute("DELETE FROM phrases WHERE id = ?", (phrase_id,))
                connection.commit()
                return cursor.rowcount > 0
            finally:
                connection.close()

    def get_llm_settings(self):
        rows = self._read("SELECT payload FROM app_settings WHERE id = ?", ("llm",))
        if not rows:
            return None
        return LlmSettings.model_validate_json(rows[0]["payload"])

    def save_llm_settings(self, settings):
        payload = settings.model_dump_json()
        with self._lock:
            connection = self._connect()
            try:
                connection.execute(
                    """
                    INSERT INTO app_settings (id, payload)
                    VALUES (?, ?)
                    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
                    """,
                    ("llm", payload),
                )
                connection.commit()
            finally:
                connection.close()
        return settings
