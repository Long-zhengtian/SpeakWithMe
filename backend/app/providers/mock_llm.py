import json
import logging
import re

from app.domain.policy import mostly_chinese
from app.domain.scenes import get_scene

logger = logging.getLogger(__name__)


def _matches(text, token):
    lowered = text.lower()
    needle = token.lower()
    if " " in needle:
        return needle in lowered
    return re.search(r"\b%s\b" % re.escape(needle), lowered) is not None


def _scene_id_from_system(system):
    match = re.search(r"^SCENE_ID:\s*(\S+)\s*$", system or "", re.M)
    if not match:
        return None
    return match.group(1)


def _note(original, suggestion, category, explanation):
    return {
        "correction": {
            "original_span": original,
            "suggestion": suggestion,
            "category": category,
            "explanation_zh": explanation,
        }
    }


def _as_sentence(text):
    cleaned = re.sub(r"\s+", " ", text).strip(" .!?")
    if not cleaned:
        return ""
    return cleaned[0].upper() + cleaned[1:] + "."


def _spoken_slip(utterance, scene_id):
    """One high-value note for slips the keyword mock used to skip."""
    if re.fullmatch(r"myself[.!?]?", utterance, re.I):
        return _note(
            "myself",
            "I was by myself.",
            "word_choice",
            "一个人要说 by myself，不能只说 myself。",
        )
    if re.search(r"\btired for\b", utterance, re.I):
        fixed = re.sub(r"\btired for\b", "tired from", utterance, count=1, flags=re.I)
        return _note(
            "tired for",
            _as_sentence(fixed),
            "word_choice",
            "因为某件事累，用 tired from，不用 tired for。",
        )
    say = re.match(r"i say\b[\s,]+(.+)", utterance, re.I)
    if say:
        rest = _as_sentence(say.group(1))
        if rest:
            return _note("I say", rest, "other", "直接说做过的事就行，不用加 I say。")
    if scene_id == "weekend" and re.search(r"\bit(?:'s| is)\b", utterance, re.I) and re.search(r"\bfun\b", utterance, re.I):
        return _note(
            "it's",
            "Yes, it was fun.",
            "tense",
            "周末已经过去，用 it was fun。",
        )
    if re.search(r"\bvery fun\b", utterance, re.I):
        fixed = re.sub(r"\bvery fun\b", "a lot of fun", utterance, count=1, flags=re.I)
        return _note("very fun", _as_sentence(fixed), "word_choice", "fun 前面不说 very，说 a lot of fun。")
    return None


def _last_user_payload(messages):
    for message in reversed(messages):
        if message.get("role") == "user":
            try:
                payload = json.loads(message.get("content") or "")
            except json.JSONDecodeError:
                return {}
            return payload if isinstance(payload, dict) else {}
    return {}


class MockLLM(object):
    """Offline stand-in so the three roles can be exercised without an API key."""

    name = "mock"

    def __init__(self):
        self.calls = []

    async def complete(self, system, messages, task, response_format):
        self.calls.append(
            {
                "task": task,
                "system": system,
                "messages": messages,
                "response_format": response_format,
            }
        )
        if task == "chat":
            return self._chat(system, messages)
        if task == "correction":
            return json.dumps(self._correction(_last_user_payload(messages)), ensure_ascii=False)
        if task == "coach":
            return json.dumps(self._coach(_last_user_payload(messages)), ensure_ascii=False)
        if task == "recap":
            return json.dumps(self._recap(_last_user_payload(messages)), ensure_ascii=False)
        if task == "scene":
            return json.dumps(self._scene(_last_user_payload(messages)), ensure_ascii=False)
        if task == "gloss":
            return json.dumps(self._gloss(_last_user_payload(messages)), ensure_ascii=False)
        logger.warning("mock llm has no script for task=%s", task)
        return ""

    def _chat(self, system, messages):
        scene_id = _scene_id_from_system(system) or ""
        user_texts = [item.get("content", "") for item in messages if item.get("role") == "user"]
        last = user_texts[-1] if user_texts else ""
        if scene_id == "custom":
            if "luggage" in (system or "").lower():
                return "I can check that. When did you last see the bag?"
            return "Okay. Can you tell me a little more?"
        scene = get_scene(scene_id)
        if scene is None:
            return "Could you say that in a shorter way?"
        if mostly_chinese(last):
            return scene.clarify_en
        for cue in scene.cues:
            if any(_matches(last, token) for token in cue.any_of):
                return cue.reply
        index = max(len(user_texts) - 1, 0)
        if scene.fallbacks:
            return scene.fallbacks[min(index, len(scene.fallbacks) - 1)]
        return scene.clarify_en

    def _correction(self, payload):
        utterance = (payload.get("utterance") or "").strip()
        scene = get_scene(payload.get("scene_id") or "")
        rescue = scene.rescue_en if scene is not None else "Could you say that in English?"
        if payload.get("assisted"):
            return {"correction": None}
        if not utterance or mostly_chinese(utterance):
            return {
                "correction": {
                    "original_span": utterance[:40] or utterance,
                    "suggestion": rescue,
                    "category": "other",
                    "explanation_zh": "这句主要是中文。可以改用英语，或先在「怎么说」里问一句。",
                }
            }
        if re.search(r"\bi want\b", utterance, re.I):
            return {
                "correction": {
                    "original_span": "I want",
                    "suggestion": "I'd like a coffee, please.",
                    "category": "politeness",
                    "explanation_zh": "点单时 I'd like 比 I want 更自然。",
                }
            }
        if re.search(r"\byesterday\b", utterance, re.I) and re.search(r"\b(go|see|eat)\b", utterance, re.I):
            return {
                "correction": {
                    "original_span": utterance,
                    "suggestion": "I went there yesterday.",
                    "category": "tense",
                    "explanation_zh": "昨天的事用过去式，比如 went，不用 go。",
                }
            }
        spoken = _spoken_slip(utterance, payload.get("scene_id") or "")
        if spoken is not None:
            return spoken
        return {"correction": None}

    def _coach(self, payload):
        intent = payload.get("intent_zh") or ""
        scene_id = payload.get("scene_id") or ""
        variant = int(payload.get("variant") or 0)
        options = _coach_options(intent, scene_id)
        sentence, simpler, gloss = options[variant % len(options)]
        return {"sentence": sentence, "simpler": simpler, "gloss_zh": gloss}

    def _recap(self, payload):
        turns = payload.get("turns") or []
        user_turns = [turn for turn in turns if turn.get("role") == "user"]
        independent = [
            turn.get("text", "")
            for turn in user_turns
            if not turn.get("assisted") and not turn.get("correction")
        ]
        assisted = [turn.get("text", "") for turn in user_turns if turn.get("assisted")]
        suggestions = []
        for turn in user_turns:
            correction = turn.get("correction") or None
            if correction and correction.get("suggestion"):
                suggestions.append(correction["suggestion"])
        went_well = []
        if independent:
            went_well.append("你自己说清了：%s" % independent[-1])
        if assisted:
            went_well.append("你用上了这句：%s" % assisted[-1])
        if not went_well:
            went_well.append("你把这场对话接完了。")
        if suggestions:
            try_next = "下一场试着自己说：%s" % suggestions[0]
        elif assisted:
            try_next = "下一场不看提示，自己说一遍：%s" % assisted[-1]
        else:
            try_next = "下一场换一个场景，仍然只改一处。"
        keep_sentence = ""
        if assisted:
            keep_sentence = assisted[-1]
        elif suggestions:
            keep_sentence = suggestions[0]
        elif independent:
            keep_sentence = independent[-1]
        revised_from = ""
        for turn in user_turns:
            correction = turn.get("correction") or None
            if correction and correction.get("suggestion"):
                revised_from = turn.get("text") or ""
                break
        return {
            "went_well": went_well[:3],
            "try_next": try_next,
            "keep_sentence": keep_sentence,
            "revised_from": revised_from,
        }

    def _scene(self, payload):
        situation = payload.get("situation_zh") or ""
        if "机场" in situation or "行李" in situation:
            return {
                "title_zh": "机场找行李",
                "description_zh": situation,
                "partner_name": "Noah",
                "partner_role_zh": "机场工作人员",
                "partner_role_en": "an airport staff member",
                "goal_zh": "说清行李丢了，并问下一步。",
                "goal_en": "Help the learner ask about lost luggage at an airport.",
                "opening": "Hi. How can I help you?",
                "clarify_en": "Sorry, where did you last see the bag?",
                "rescue_en": "I can't find my bag.",
            }
        return {
            "title_zh": "自己的一场",
            "description_zh": situation,
            "partner_name": "Alex",
            "partner_role_zh": "对方",
            "partner_role_en": "the other person in this situation",
            "goal_zh": "把这件事说清楚。",
            "goal_en": "Help the learner explain the situation in simple English.",
            "opening": "Hi. What happened?",
            "clarify_en": "Sorry, could you say that more simply?",
            "rescue_en": "Could you help me, please?",
        }

    def _gloss(self, payload):
        text = (payload.get("text") or "").strip()
        known = {
            "latte": "拿铁",
            "coffee": "咖啡",
            "please": "请",
            "size": "尺寸",
            "small": "小杯",
            "medium": "中杯",
            "large": "大杯",
            "iced": "冰的",
            "hot": "热的",
            "sorry": "抱歉",
            "late": "迟到",
            "train": "火车",
            "movie": "电影",
            "weekend": "周末",
            "bag": "包",
        }
        if " " in text:
            gloss = "一句可以直接说的英语。"
        else:
            gloss = known.get(text.lower(), "放到句子里看它的意思。")
        return {"gloss_zh": gloss}


def _coach_options(intent, scene_id):
    text = intent or ""
    options = []
    if any(word in text for word in ("迟到", "地铁", "火车", "公交")) or scene_id == "running_late" and "晚" in text:
        options.append(("Sorry I'm late. The train was delayed.", "Sorry, the train was late.", "抱歉，地铁晚点了。"))
        options.append(("I'm on my way. I'll be there in ten minutes.", "I'll be there in ten minutes.", "我在路上，十分钟到。"))
    if any(word in text for word in ("电影", "周末", "公园")):
        options.append(("I watched a movie this weekend.", "I saw a movie.", "我这周末看了电影。"))
        options.append(("I went to the park with a friend.", "I went to the park.", "我和朋友去了公园。"))
    if any(word in text for word in ("多少钱", "价格", "几块")):
        options.append(("How much is that?", "How much?", "多少钱？"))
        options.append(("How much is a medium one?", "How much is a medium?", "中杯多少钱？"))
    if any(word in text for word in ("拿铁", "咖啡", "茶")):
        if "冰" in text:
            options.append(("Could I get an iced latte, please?", "An iced latte, please.", "请给我一杯冰拿铁。"))
            options.append(("I'd like an iced latte.", "Iced latte, please.", "我想要一杯冰拿铁。"))
        elif "热" in text:
            options.append(("I'd like a hot latte, please.", "A hot latte, please.", "请给我一杯热拿铁。"))
            options.append(("Could I get a hot coffee, please?", "A hot coffee, please.", "请给我一杯热咖啡。"))
        elif "茶" in text and "拿铁" not in text and "咖啡" not in text:
            options.append(("Could I get a tea, please?", "A tea, please.", "请给我一杯茶。"))
            options.append(("I'd like a tea.", "Tea, please.", "我想要一杯茶。"))
        else:
            options.append(("I'd like a latte, please.", "A latte, please.", "请给我一杯拿铁。"))
            options.append(("Could I get a coffee, please?", "A coffee, please.", "请给我一杯咖啡。"))
    if options:
        return options
    return [
        ("Could I say that in a simple way?", "Can I use a simple sentence?", "我用一句简单的英语先接上。"),
        ("Let me try a short sentence.", "A short sentence is fine.", "我先说一句短的。"),
    ]
