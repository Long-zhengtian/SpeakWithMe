from typing import Optional


class LevelSpec(object):
    def __init__(self, id, label_zh, hint_zh, guide_en, max_sentences):
        self.id = id
        self.label_zh = label_zh
        self.hint_zh = hint_zh
        self.guide_en = guide_en
        self.max_sentences = max_sentences


LEVELS = (
    LevelSpec(
        "A1",
        "A1",
        "刚开口",
        "Use very common words. Use one short sentence. Ask one question the learner can answer in a few words.",
        1,
    ),
    LevelSpec(
        "A2",
        "A2",
        "能说短句",
        "Use everyday words and stay concrete. Use one or two short sentences. Ask one question about a specific detail.",
        2,
    ),
    LevelSpec(
        "B1",
        "B1",
        "能把事情讲完",
        "Sound natural and include one concrete detail. Use two or three sentences. Ask one question.",
        3,
    ),
)


def get_level(level_id):
    # type: (str) -> Optional[LevelSpec]
    for level in LEVELS:
        if level.id == level_id:
            return level
    return None
