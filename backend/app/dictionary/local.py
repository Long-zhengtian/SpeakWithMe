import json
from pathlib import Path

import brotli


DICTIONARY_DIR = Path(__file__).resolve().parent / "ecdict"
MAX_DEFINITIONS = 8
MAX_GLOSS_CHARS = 80


def normalize_word(query):
    word = (query or "").strip().lower().replace("’", "'").replace("‘", "'")
    start = 0
    end = len(word)
    while start < end and not word[start].isalpha():
        start += 1
    while end > start and not (word[end - 1].isalpha() or word[end - 1].isdigit()):
        end -= 1
    return word[start:end]


def candidate_words(word):
    candidates = []

    def add(value):
        if value and value not in candidates:
            candidates.append(value)

    add(word)
    if word.endswith("'s"):
        add(word[:-2])
    if word.endswith("s'"):
        add(word[:-2])
    if word.endswith("ies") and len(word) > 4:
        add(word[:-3] + "y")
    if word.endswith("es") and len(word) > 3:
        add(word[:-2])
    if word.endswith("s") and len(word) > 3:
        add(word[:-1])
    if word.endswith("ied") and len(word) > 4:
        add(word[:-3] + "y")
    if word.endswith("ed") and len(word) > 4:
        add(word[:-2])
        add(word[:-1])
    if word.endswith("ing") and len(word) > 5:
        add(word[:-3])
        add(word[:-3] + "e")
    return candidates


def lemma_of(exchange):
    for part in (exchange or "").split("/"):
        if part.startswith("0:") and part[2:].strip():
            return normalize_word(part[2:])
    return ""


def split_definitions(translation):
    lines = []
    for line in (translation or "").replace("\\n", "\n").splitlines():
        cleaned = line.strip()
        if cleaned:
            lines.append(cleaned)
        if len(lines) >= MAX_DEFINITIONS:
            break
    return lines


class LocalDictionary(object):
    """Offline English-Chinese lookup. Buckets come from ECDICT."""

    def __init__(self, directory=None):
        self.directory = Path(directory) if directory else DICTIONARY_DIR
        self._buckets = {}

    def lookup(self, query):
        normalized = normalize_word(query)
        if not normalized:
            return None
        for candidate in candidate_words(normalized):
            entry = self._entry(candidate)
            if not entry:
                continue
            found = self._present(query, candidate, entry)
            if found:
                return found
        return None

    def _present(self, query, candidate, entry):
        lemma_word = lemma_of(entry[2] if len(entry) > 2 else "")
        base = self._entry(lemma_word) if lemma_word and lemma_word != candidate else None
        definitions = []
        if base:
            definitions.extend(split_definitions(base[1] if len(base) > 1 else ""))
        for line in split_definitions(entry[1] if len(entry) > 1 else ""):
            if line not in definitions:
                definitions.append(line)
        definitions = definitions[:MAX_DEFINITIONS]
        gloss = definitions[0] if definitions else ""
        if len(gloss) > MAX_GLOSS_CHARS:
            gloss = gloss[:MAX_GLOSS_CHARS]
        if not gloss:
            return None
        phonetic = entry[0] if len(entry) > 0 and entry[0] else ""
        if not phonetic and base and len(base) > 0:
            phonetic = base[0] or ""
        shown_lemma = lemma_word if lemma_word and lemma_word != normalize_word(query) else ""
        if not shown_lemma and candidate != normalize_word(query):
            shown_lemma = candidate
        return {
            "text": (query or "").strip(),
            "gloss_zh": gloss,
            "phonetic": phonetic or "",
            "definitions": definitions,
            "lemma": shown_lemma,
        }

    def _entry(self, word):
        if not word:
            return None
        return self._bucket(word[:1]).get(word)

    def _bucket(self, letter):
        name = letter if "a" <= letter <= "z" else ""
        if name in self._buckets:
            return self._buckets[name]
        path = self.directory / ("%s.json.br" % name)
        if not name or not path.is_file():
            self._buckets[name] = {}
            return self._buckets[name]
        payload = json.loads(brotli.decompress(path.read_bytes()))
        self._buckets[name] = payload
        return payload
