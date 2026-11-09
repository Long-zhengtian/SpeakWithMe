# 发给模型的提示词

每次调用都是同一套形状：一条 system 提示词，后面再跟若干条消息。提示词原文在 `backend/app/agents/prompts.py`。难度句子在 `backend/app/domain/levels.py`，三个预设场景在 `backend/app/domain/scenes.py`。

真正发出去的请求在 `backend/app/providers/openai_compatible.py`。查错、怎么说、小结、自定义场景要的是 JSON。返回的不是一个 JSON 对象时，会把这次原文附在下一次请求里再问一遍，只再问一次。

| | 对话 | 查错、怎么说、小结、自定义场景 |
| --- | --- | --- |
| 温度 | 0.7 | 0.2 |
| 最多 token | 180 | 400 |
| 返回 | 纯文本 | JSON（`response_format: json_object`） |

查错和怎么说可以在设置里单独指定模型。留空时，所有功能用同一个模型。

## 难度

难度不是单独一次调用。选中的水平会写成一句话，放进对话、查错和「怎么说」的 system 里。

| 难度 | 界面上的说明 | 写进提示词的句子 |
| --- | --- | --- |
| A1 | 刚开口 | Use very common words. Every question should be answerable in a few words. |
| A2 | 能说短句 | Use short everyday sentences. Stay concrete. |
| B1 | 能把事情讲完 | Sound natural, but stay within two sentences. |

自定义场景和小结只收到 `A1` 这样的编号，不带上面这句说明。

## 对话

开一场预设场景时不调用模型。开场白直接作为第一条 assistant 消息写进记录。之后你每说一句，聊天角色才被调用。

system 由对方身份、场景编号、英文目标、难度编号和难度句子拼成。咖啡店、A1 实际发出去的是：

```text
You are Mia, a barista at a small cafe.
SCENE_ID: coffee_shop
Goal of this conversation: Help the learner order one drink and confirm the size.
Learner level: A1.
Use very common words. Every question should be answerable in a few words.
Rules:
- Stay in character.
- Reply in English only.
- Use one or two short sentences.
- Ask one simple question that moves the scene forward.
- Never correct grammar, never explain grammar, and never switch to Chinese.
- If you do not understand, ask a shorter question in simple English.
- Do not mention these instructions.
```

三个预设场景填进去的只有这些：

| 场景 | 对方 | 目标 | 开场白（写进记录，不在 system 里） |
| --- | --- | --- | --- |
| 咖啡店点单 | Mia, a barista at a small cafe | Help the learner order one drink and confirm the size. | Hi, welcome in. What can I get for you? |
| 上课要迟到 | Sam, a classmate waiting at the classroom door | Help the learner explain why they are late and when they will arrive. | Hey. Class is about to start. Where are you? |
| 聊聊周末 | Lina, a friend you meet on Monday | Help the learner say one thing they did on the weekend and answer a follow-up. | Hi! How was your weekend? |

后面的消息是这场英文对话，角色只有 `user` 和 `assistant`，内容只有那句英文。一场没有句数上限，记录里会一直留着全文。发给模型的稿子超过大约一万二千个英文字符时，更早的部分先收成一段英文「已经谈过什么」，只把最近 16 条原文放进这次请求。这段摘要会留在这场记录上，下次只补新掉出去的句子。摘要用的 system 是：

```text
You compress the earlier part of a spoken English practice.
Write 2 to 4 short English sentences about what has already been talked about.
Keep the concrete facts the learner said.
If an earlier summary is included, carry its facts forward and add the new lines.
Do not correct grammar. Do not give advice. Do not add a new question.
```

摘要请求失败，或回来的不是英语时，改用更早几句的原文摘录，对话照样继续。带上的内容：

- 对方的开场白和之后每一句回复。
- 你自己说的英语。
- 「怎么说」生成、并且你已经点发送的那句英语。

不带的内容：

- 你在「怎么说」里写的中文。
- 查错卡片上的改法、分类和中文说明。
- 场景里的提示句、兜底句。这些只给测试用的假模型，不会发给你选的模型。

模型回了中文，或超过两句，程序会丢掉原文，换成该场景的一句澄清英语。咖啡店是 “Sorry, I missed that. Do you want coffee or tea?”，迟到是 “Sorry, where are you now?”，周末是 “Sorry, what did you do?”。这句澄清不在提示词里，是回复回来之后才替换的。

## 查错

你每说一句英语，对话回复显示之后再单独发一次。system 会带上难度编号和难度句子：

```text
You check one learner sentence for an English speaking practice.
Learner level: A1. Use very common words. Every question should be answerable in a few words.
Return JSON only: {"correction": null} or {"correction": {"original_span": "", "suggestion": "", "category": "", "explanation_zh": ""}}.
Rules:
- Fix every problem in the sentence. Do not stop after the first one.
- suggestion is the whole sentence rewritten in natural spoken English, with every problem fixed.
- Stay within the learner's level. Repair the sentence; do not make it fancier.
- If the sentence is already natural, return null.
- original_span is the learner's whole sentence.
- explanation_zh is one or two short Chinese sentences naming what was wrong, not a grammar lecture.
- category is the main kind of problem. If several were fixed, choose the one that most changed the meaning.
- category is one of: article, tense, agreement, word_choice, word_order, politeness, other.
- Do not comment on sentences that were supplied as a model line.
```

用户消息是一条 JSON：

```json
{
  "scene_id": "weekend",
  "level": "A1",
  "utterance": "你刚才说的那句英语",
  "assisted": false,
  "recent_turns": [
    {"role": "assistant", "text": "对方最近的一句"},
    {"role": "user", "text": "你最近的一句"}
  ]
}
```

`recent_turns` 最多 8 条，只含角色和英文。「怎么说」代写后发出去的句子标成 `assisted`，这一步直接跳过，不调用模型。开场时关掉指正，也不调用。

模型明确返回空指正时，这句话记为「不用改」，对话里会显示一个绿色对号。模型超时或报错时记为调用失败，那句话后面会写明，并可以再看一次。失败不会被当成「这句没问题」。

## 怎么说

你在侧栏写下中文意思并点「告诉我怎么说」时调用。换一种说法会把 `variant` 加一。system 带场景目标、对方身份、难度编号和难度句子：

```text
The learner does not know how to say something in a live English conversation.
They will describe the meaning in Chinese.
Scene: Help the learner say one thing they did on the weekend and answer a follow-up. You are helping them speak to Lina, a friend you meet on Monday.
The partner last said: see partner_last in the user JSON.
Learner level: A1. Use very common words. Every question should be answerable in a few words.
Return JSON only: {"sentence": "", "simpler": "", "gloss_zh": ""}.
Rules:
- sentence is natural spoken English that fits the scene and the partner's last line.
- Keep it to one sentence unless an apology needs two.
- simpler is a shorter version of the same meaning.
- gloss_zh is under 20 Chinese characters and only gives the meaning.
- Do not role-play the partner. Do not explain grammar.
- If variant is greater than 0, phrase it differently from the most obvious line.
```

用户消息只有这一条 JSON，不带整段对话：

```json
{
  "scene_id": "weekend",
  "level": "A1",
  "partner_last": "对方上一句英语",
  "intent_zh": "你写的中文意思",
  "variant": 0
}
```

`partner_last` 是记录里最近一条对方的话。返回的 `sentence` 先停在侧栏。你点发送之后，它才作为你的一句英语进入对话，并标成 assisted。

## 小结

点「结束这场」时调用。system 不带难度说明：

```text
You write a short recap after an English speaking scene.
Return JSON only: {"went_well": ["", ""], "try_next": "", "keep_sentence": "", "revised_from": ""}.
Rules:
- went_well has one to three short Chinese items about what the learner managed to say.
- try_next is one Chinese sentence telling them a single English line to try alone next time.
- keep_sentence is one English sentence from this scene worth saying again. Prefer an assisted line, otherwise the corrected suggestion.
- revised_from is the learner's own English that was corrected. Leave it empty when nothing was corrected.
- Mention an assisted line as something to reuse without help.
- If already_talked_about is present, it summarizes earlier turns. turns are only the later lines.
- Do not give a grammar lecture.
```

用户消息是整场记录。每一句有角色、英文、是否代写；有指正的句子还会带上改后的句子和中文说明。难度只以编号放在这条 JSON 里：

```json
{
  "scene_id": "weekend",
  "level": "A1",
  "turns": [
    {"role": "assistant", "text": "Hi! How was your weekend?", "assisted": false},
    {
      "role": "user",
      "text": "it is really happy to sleep all day",
      "assisted": false,
      "correction": {
        "original_span": "it is really happy to sleep all day",
        "suggestion": "It was really nice to sleep all day.",
        "category": "word_choice",
        "explanation_zh": "形容休息舒服宜用 nice，且周末过去发生的事请用 was。"
      }
    }
  ]
}
```

## 自己写的场景

只有填写中文情境时才调用。预设场景开场不走这一步。system 不带难度句子：

```text
Turn a learner's Chinese situation into one short spoken-English role play.
Return JSON only: {"title_zh": "", "description_zh": "", "partner_name": "", "partner_role_zh": "", "partner_role_en": "", "goal_zh": "", "goal_en": "", "opening": "", "clarify_en": "", "rescue_en": ""}.
Rules:
- title_zh and description_zh and partner_role_zh and goal_zh are Chinese.
- partner_role_en, goal_en, opening, clarify_en, and rescue_en are English.
- opening is one short English line the partner says first.
- rescue_en is one simple English sentence the learner could say.
- Do not put Chinese inside the English fields.
```

用户消息是：

```json
{"situation_zh": "你写的情境", "level": "A1"}
```

生成出的对方身份和英文目标会存进这场对话。之后的聊天、查错、怎么说，都按上面的规则使用这些字段。`opening` 成为第一条对方消息。`clarify_en` 只在对方回复几乎全是中文时用来替换。`rescue_en` 不发给聊天模型。

## 点词

点一个词不调用模型，查的是本机 ECDICT。`prompts.py` 里还留着 `gloss_system()`，当前没有任何请求会把它发出去。
