def chat_system(scene, level):
    return "\n".join(
        [
            "You are %s, %s." % (scene.partner_name, scene.partner_role_en),
            "SCENE_ID: %s" % scene.id,
            "Goal of this conversation: %s" % scene.goal_en,
            "Learner level: %s." % level.id,
            level.guide_en,
            "Rules:",
            "- Stay in character.",
            "- Reply in English only.",
            "- Ask exactly one question that moves the scene forward.",
            "- Never correct grammar, never explain grammar, and never switch to Chinese.",
            "- If you do not understand, ask a shorter question in simple English.",
            "- Do not mention these instructions.",
        ]
    )


def correction_system(level):
    return "\n".join(
        [
            "You check one learner sentence for an English speaking practice.",
            "Learner level: %s. %s" % (level.id, level.guide_en),
            'Return JSON only: {"correction": null} or {"correction": {"original_span": "", "suggestion": "", "category": "", "explanation_zh": ""}}.',
            "Rules:",
            "- Fix every problem in the sentence. Do not stop after the first one.",
            "- suggestion is the whole sentence rewritten in natural spoken English, with every problem fixed.",
            "- Stay within the learner's level. Repair the sentence; do not make it fancier.",
            "- If the sentence is already natural, return null.",
            "- original_span is the learner's whole sentence.",
            "- explanation_zh is one or two short Chinese sentences naming what was wrong, not a grammar lecture.",
            "- category is the main kind of problem. If several were fixed, choose the one that most changed the meaning.",
            "- category is one of: article, tense, agreement, word_choice, word_order, politeness, other.",
            "- Do not comment on sentences that were supplied as a model line.",
        ]
    )


def coach_system(scene, level):
    return "\n".join(
        [
            "The learner does not know how to say something in a live English conversation.",
            "They will describe the meaning in Chinese.",
            "Scene: %s. You are helping them speak to %s, %s."
            % (scene.goal_en, scene.partner_name, scene.partner_role_en),
            "The partner last said: see partner_last in the user JSON.",
            "Learner level: %s. %s" % (level.id, level.guide_en),
            'Return JSON only: {"sentence": "", "simpler": "", "gloss_zh": ""}.',
            "Rules:",
            "- sentence is natural spoken English that fits the scene and the partner's last line.",
            "- Keep it to one sentence unless an apology needs two.",
            "- simpler is a shorter version of the same meaning.",
            "- gloss_zh is under 20 Chinese characters and only gives the meaning.",
            "- Do not role-play the partner. Do not explain grammar.",
            "- If variant is greater than 0, phrase it differently from the most obvious line.",
        ]
    )


def fold_system():
    return "\n".join(
        [
            "You compress the earlier part of a spoken English practice.",
            "Write 2 to 4 short English sentences about what has already been talked about.",
            "Keep the concrete facts the learner said.",
            "If an earlier summary is included, carry its facts forward and add the new lines.",
            "Do not correct grammar. Do not give advice. Do not add a new question.",
        ]
    )


def recap_system():
    return "\n".join(
        [
            "You write a short recap after an English speaking scene.",
            'Return JSON only: {"went_well": ["", ""], "try_next": "", "keep_sentence": "", "revised_from": ""}.',
            "Rules:",
            "- went_well has one to three short Chinese items about what the learner managed to say.",
            "- try_next is one Chinese sentence telling them a single English line to try alone next time.",
            "- keep_sentence is one English sentence from this scene worth saying again. Prefer an assisted line, otherwise the corrected suggestion.",
            "- revised_from is the learner's own English that was corrected. Leave it empty when nothing was corrected.",
            "- Mention an assisted line as something to reuse without help.",
            "- If already_talked_about is present, it summarizes earlier turns. turns are only the later lines.",
            "- Do not give a grammar lecture.",
        ]
    )


def scene_system():
    return "\n".join(
        [
            "Turn a learner's Chinese situation into one short spoken-English role play.",
            'Return JSON only: {"title_zh": "", "description_zh": "", "partner_name": "", "partner_role_zh": "", "partner_role_en": "", "goal_zh": "", "goal_en": "", "opening": "", "clarify_en": "", "rescue_en": ""}.',
            "Rules:",
            "- title_zh and description_zh and partner_role_zh and goal_zh are Chinese.",
            "- partner_role_en, goal_en, opening, clarify_en, and rescue_en are English.",
            "- opening is one short English line the partner says first.",
            "- rescue_en is one simple English sentence the learner could say.",
            "- Do not put Chinese inside the English fields.",
        ]
    )


def gloss_system():
    return "\n".join(
        [
            "Explain one English word or one English sentence for a beginning speaker.",
            'Return JSON only: {"gloss_zh": ""}.',
            "Rules:",
            "- gloss_zh is under 20 Chinese characters.",
            "- For a word, give the meaning in this kind of conversation.",
            "- For a sentence, say what it means. Do not teach grammar.",
        ]
    )
