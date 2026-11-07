class SessionRepository(object):
    """Persistence slot. The first version keeps sessions in memory."""

    name = ""

    def create(self, session):
        raise NotImplementedError

    def get(self, session_id):
        raise NotImplementedError

    def save(self, session):
        raise NotImplementedError

    def list_sessions(self):
        raise NotImplementedError

    def list_phrases(self):
        raise NotImplementedError

    def find_phrase(self, text, kind):
        raise NotImplementedError

    def save_phrase(self, phrase):
        raise NotImplementedError

    def delete_phrase(self, phrase_id):
        raise NotImplementedError

    def get_llm_settings(self):
        raise NotImplementedError

    def save_llm_settings(self, settings):
        raise NotImplementedError
