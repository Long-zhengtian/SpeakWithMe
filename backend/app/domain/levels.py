from typing import Optional


class LevelSpec(object):
    def __init__(self, id, label_zh, hint_zh, guide_en):
        self.id = id
        self.label_zh = label_zh
        self.hint_zh = hint_zh
        self.guide_en = guide_en


LEVELS = (
    LevelSpec(
        "A1",
        "A1",
        "刚开口",
        "Use very common words. Every question should be answerable in a few words.",
    ),
    LevelSpec(
        "A2",
        "A2",
        "能说短句",
        "Use short everyday sentences. Stay concrete.",
    ),
    LevelSpec(
        "B1",
        "B1",
        "能把事情讲完",
        "Sound natural, but stay within two sentences.",
    ),
)


def get_level(level_id):
    # type: (str) -> Optional[LevelSpec]
    for level in LEVELS:
        if level.id == level_id:
            return level
    return None
