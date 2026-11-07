from typing import Optional


class Cue(object):
    def __init__(self, any_of, reply):
        self.any_of = any_of
        self.reply = reply


class Scene(object):
    def __init__(
        self,
        id,
        title,
        title_zh,
        description_zh,
        partner_name,
        partner_role_zh,
        partner_role_en,
        goal_zh,
        goal_en,
        opening,
        clarify_en,
        rescue_en,
        cues,
        fallbacks,
    ):
        self.id = id
        self.title = title
        self.title_zh = title_zh
        self.description_zh = description_zh
        self.partner_name = partner_name
        self.partner_role_zh = partner_role_zh
        self.partner_role_en = partner_role_en
        self.goal_zh = goal_zh
        self.goal_en = goal_en
        self.opening = opening
        self.clarify_en = clarify_en
        self.rescue_en = rescue_en
        self.cues = cues
        self.fallbacks = fallbacks


SCENES = (
    Scene(
        id="coffee_shop",
        title="Coffee order",
        title_zh="咖啡店点单",
        description_zh="向店员点一杯喝的，把尺寸和冷热说清楚。",
        partner_name="Mia",
        partner_role_zh="咖啡店员",
        partner_role_en="a barista at a small cafe",
        goal_zh="点完一杯喝的，并确认尺寸。",
        goal_en="Help the learner order one drink and confirm the size.",
        opening="Hi, welcome in. What can I get for you?",
        clarify_en="Sorry, I missed that. Do you want coffee or tea?",
        rescue_en="I'd like a coffee, please.",
        cues=(
            Cue(("how much", "price", "cost"), "A small is three dollars, and a medium is four."),
            Cue(("my name", "i am", "i'm"), "Thanks. I will have that ready in a minute."),
            Cue(("small", "medium", "large"), "Got it. Would you like that hot or iced?"),
            Cue(("iced", "ice"), "Iced, sure. Small or medium?"),
            Cue(("hot",), "Hot, sure. Small or medium?"),
            Cue(
                ("latte", "cappuccino", "americano", "espresso", "tea", "coffee"),
                "Sure. What size would you like?",
            ),
            Cue(("hello", "hi", "hey"), "Hi. What can I get for you?"),
        ),
        fallbacks=(
            "What can I get started for you?",
            "What size would you like?",
            "Would you like it hot or iced?",
            "Anything else with that?",
            "Great. I will have it ready.",
        ),
    ),
    Scene(
        id="running_late",
        title="Running late",
        title_zh="上课要迟到",
        description_zh="告诉同学你为什么还没到，以及大概还要多久。",
        partner_name="Sam",
        partner_role_zh="同学",
        partner_role_en="a classmate waiting at the classroom door",
        goal_zh="说明迟到的原因，并说你什么时候到。",
        goal_en="Help the learner explain why they are late and when they will arrive.",
        opening="Hey. Class is about to start. Where are you?",
        clarify_en="Sorry, where are you now?",
        rescue_en="Sorry I'm late. I'm on my way.",
        cues=(
            Cue(
                ("sorry", "late", "train", "subway", "metro", "delayed", "bus"),
                "Thanks for telling me. How long will you be?",
            ),
            Cue(("minute", "soon", "almost", "near", "five", "ten"), "Okay. I will save you a seat."),
            Cue(("hello", "hi", "hey"), "Hey. Are you close?"),
        ),
        fallbacks=(
            "Where are you now?",
            "How long will you be?",
            "Okay. Come in quietly when you arrive.",
        ),
    ),
    Scene(
        id="weekend",
        title="Weekend chat",
        title_zh="聊聊周末",
        description_zh="用几句简单的话告诉朋友周末做了什么。",
        partner_name="Lina",
        partner_role_zh="朋友",
        partner_role_en="a friend you meet on Monday",
        goal_zh="说出周末做的一件事，并回答一个追问。",
        goal_en="Help the learner say one thing they did on the weekend and answer a follow-up.",
        opening="Hi! How was your weekend?",
        clarify_en="Sorry, what did you do?",
        rescue_en="I had a nice weekend.",
        cues=(
            Cue(("movie", "film", "cinema"), "Nice. Did you like it?"),
            Cue(("park", "friend", "family", "home", "hike", "rest"), "That sounds good. Who were you with?"),
            Cue(("hello", "hi", "hey"), "Hi! What did you do?"),
        ),
        fallbacks=(
            "What did you do?",
            "Was it fun?",
            "Who were you with?",
            "That sounds like a good weekend.",
        ),
    ),
)


def list_scenes():
    return SCENES


def get_scene(scene_id):
    # type: (str) -> Optional[Scene]
    for scene in SCENES:
        if scene.id == scene_id:
            return scene
    return None


def scene_for(session):
    custom = session.custom_scene
    if custom is None:
        return get_scene(session.scene_id)
    return Scene(
        id="custom",
        title=custom.title_zh,
        title_zh=custom.title_zh,
        description_zh=custom.description_zh,
        partner_name=custom.partner_name,
        partner_role_zh=custom.partner_role_zh,
        partner_role_en=custom.partner_role_en,
        goal_zh=custom.goal_zh,
        goal_en=custom.goal_en,
        opening=custom.opening,
        clarify_en=custom.clarify_en,
        rescue_en=custom.rescue_en,
        cues=(),
        fallbacks=(custom.clarify_en,),
    )
