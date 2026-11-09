export type LevelSpec = { id: string; label_zh: string; hint_zh: string; guide_en: string; max_sentences: number };

export type PartnerSpec = {
  id: string;
  name: string;
  personality_zh: string;
  personality_en: string;
};

export const PARTNERS: PartnerSpec[] = [
  {
    id: "mia",
    name: "Mia",
    personality_zh: "温和、耐心，说话短，像在接待客人。",
    personality_en: "Warm and patient. Keep lines short, like someone welcoming a guest.",
  },
  {
    id: "sam",
    name: "Sam",
    personality_zh: "直接，稍微着急，像同学在等你。",
    personality_en: "Direct and a little hurried, like a classmate who is waiting.",
  },
  {
    id: "lina",
    name: "Lina",
    personality_zh: "随意、爱追问，像朋友闲聊。",
    personality_en: "Easygoing and curious, like a friend making small talk.",
  },
];

export function getPartner(id: string) {
  return PARTNERS.find((partner) => partner.id === id);
}

export type SceneSpec = {
  id: string;
  title: string;
  title_zh: string;
  description_zh: string;
  partner_id: string;
  partner_name: string;
  partner_role_zh: string;
  partner_role_en: string;
  goal_zh: string;
  goal_en: string;
  opening: string;
  clarify_en: string;
  rescue_en: string;
};

export const LEVELS: LevelSpec[] = [
  { id: "A1", label_zh: "A1", hint_zh: "刚开口", guide_en: "Use very common words. Use one short sentence. Ask one question the learner can answer in a few words.", max_sentences: 1 },
  { id: "A2", label_zh: "A2", hint_zh: "能说短句", guide_en: "Use everyday words and stay concrete. Use one or two short sentences. Ask one question about a specific detail.", max_sentences: 2 },
  { id: "B1", label_zh: "B1", hint_zh: "能把事情讲完", guide_en: "Sound natural and include one concrete detail. Use two or three sentences. Ask one question.", max_sentences: 3 },
];

export const SCENES: SceneSpec[] = [
  {
    id: "coffee_shop",
    title: "Coffee order",
    title_zh: "咖啡店点单",
    description_zh: "向店员点一杯喝的，把尺寸和冷热说清楚。",
    partner_id: "mia",
    partner_name: "Mia",
    partner_role_zh: "咖啡店员",
    partner_role_en: "a barista at a small cafe",
    goal_zh: "点完一杯喝的，并确认尺寸。",
    goal_en: "Help the learner order one drink and confirm the size.",
    opening: "Hi, welcome in. What can I get for you?",
    clarify_en: "Sorry, I missed that. Do you want coffee or tea?",
    rescue_en: "I'd like a coffee, please.",
  },
  {
    id: "running_late",
    title: "Running late",
    title_zh: "上课要迟到",
    description_zh: "告诉同学你为什么还没到，以及大概还要多久。",
    partner_id: "sam",
    partner_name: "Sam",
    partner_role_zh: "同学",
    partner_role_en: "a classmate waiting at the classroom door",
    goal_zh: "说明迟到的原因，并说你什么时候到。",
    goal_en: "Help the learner explain why they are late and when they will arrive.",
    opening: "Hey. Class is about to start. Where are you?",
    clarify_en: "Sorry, where are you now?",
    rescue_en: "Sorry I'm late. I'm on my way.",
  },
  {
    id: "weekend",
    title: "Weekend chat",
    title_zh: "聊聊周末",
    description_zh: "用几句简单的话告诉朋友周末做了什么。",
    partner_id: "lina",
    partner_name: "Lina",
    partner_role_zh: "朋友",
    partner_role_en: "a friend you meet on Monday",
    goal_zh: "说出周末做的一件事，并回答一个追问。",
    goal_en: "Help the learner say one thing they did on the weekend and answer a follow-up.",
    opening: "Hi! How was your weekend?",
    clarify_en: "Sorry, what did you do?",
    rescue_en: "I had a nice weekend.",
  },
];

export function getLevel(id: string) {
  return LEVELS.find((level) => level.id === id);
}

export function getScene(id: string) {
  return SCENES.find((scene) => scene.id === id);
}

export type CustomScene = {
  title_zh: string;
  description_zh: string;
  partner_name: string;
  partner_role_zh: string;
  partner_role_en: string;
  goal_zh: string;
  goal_en: string;
  opening: string;
  clarify_en: string;
  rescue_en: string;
};

export function sceneFor(session: { scene_id: string; custom_scene: CustomScene | null }): SceneSpec | null {
  if (session.custom_scene) {
    const custom = session.custom_scene;
    return {
      id: "custom",
      partner_id: "",
      title: custom.title_zh,
      title_zh: custom.title_zh,
      description_zh: custom.description_zh,
      partner_name: custom.partner_name,
      partner_role_zh: custom.partner_role_zh,
      partner_role_en: custom.partner_role_en,
      goal_zh: custom.goal_zh,
      goal_en: custom.goal_en,
      opening: custom.opening,
      clarify_en: custom.clarify_en,
      rescue_en: custom.rescue_en,
    };
  }
  return getScene(session.scene_id) || null;
}

export function publicScene(session: { scene_id: string; title_zh: string; custom_scene: CustomScene | null }) {
  const scene = sceneFor(session);
  if (!scene) {
    return {
      id: session.scene_id,
      title: "已下线的场景",
      title_zh: "已下线的场景",
      description_zh: "",
      partner_name: "",
      partner_role_zh: "",
      goal_zh: "",
      opening: "",
    };
  }
  const title = session.title_zh.trim() || scene.title_zh;
  return {
    id: scene.id,
    title: session.title_zh.trim() ? title : scene.title,
    title_zh: title,
    description_zh: scene.description_zh,
    partner_name: scene.partner_name,
    partner_role_zh: scene.partner_role_zh,
    goal_zh: scene.goal_zh,
    opening: scene.opening,
  };
}

export function personalityLines(partner?: { personality_zh: string; personality_en: string } | null) {
  if (!partner) return [];
  return [
    `Personality: ${partner.personality_en}`,
    `The learner describes this person in Chinese: ${partner.personality_zh}`,
    "Follow that personality. If the two descriptions differ, follow the Chinese one.",
  ];
}

export function chatSystem(scene: SceneSpec, level: LevelSpec, partner?: { personality_zh: string; personality_en: string } | null) {
  return [
    `You are ${scene.partner_name}, ${scene.partner_role_en}.`,
    `SCENE_ID: ${scene.id}`,
    `Goal of this conversation: ${scene.goal_en}`,
    `Learner level: ${level.id}.`,
    level.guide_en,
    ...personalityLines(partner),
    "Rules:",
    "- Stay in character.",
    "- Reply in English only.",
    "- Ask exactly one question that moves the scene forward.",
    "- Never correct grammar, never explain grammar, and never switch to Chinese.",
    "- If you do not understand, ask a shorter question in simple English.",
    "- Do not mention these instructions.",
  ].join("\n");
}

export function correctionSystem(level: LevelSpec) {
  return [
    "You check one learner sentence for an English speaking practice.",
    `Learner level: ${level.id}. ${level.guide_en}`,
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
  ].join("\n");
}

export function coachSystem(scene: SceneSpec, level: LevelSpec, partner?: { personality_zh: string; personality_en: string } | null) {
  return [
    "The learner does not know how to say something in a live English conversation.",
    "They will describe the meaning in Chinese.",
    `Scene: ${scene.goal_en}. You are helping them speak to ${scene.partner_name}, ${scene.partner_role_en}.`,
    ...personalityLines(partner),
    "The partner last said: see partner_last in the user JSON.",
    `Learner level: ${level.id}. ${level.guide_en}`,
    'Return JSON only: {"sentence": "", "simpler": "", "gloss_zh": ""}.',
    "Rules:",
    "- sentence is natural spoken English that fits the scene and the partner's last line.",
    "- Keep it to one sentence unless an apology needs two.",
    "- simpler is a shorter version of the same meaning.",
    "- gloss_zh is under 20 Chinese characters and only gives the meaning.",
    "- Do not role-play the partner. Do not explain grammar.",
    "- If variant is greater than 0, phrase it differently from the most obvious line.",
  ].join("\n");
}

export function foldSystem() {
  return [
    "You compress the earlier part of a spoken English practice.",
    "Write 2 to 4 short English sentences about what has already been talked about.",
    "Keep the concrete facts the learner said.",
    "If an earlier summary is included, carry its facts forward and add the new lines.",
    "Do not correct grammar. Do not give advice. Do not add a new question.",
  ].join("\n");
}

export function recapSystem() {
  return [
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
  ].join("\n");
}

export function sceneSystem() {
  return [
    "Turn a learner's Chinese situation into one short spoken-English role play.",
    'Return JSON only: {"title_zh": "", "description_zh": "", "partner_name": "", "partner_role_zh": "", "partner_role_en": "", "goal_zh": "", "goal_en": "", "opening": "", "clarify_en": "", "rescue_en": ""}.',
    "Rules:",
    "- title_zh and description_zh and partner_role_zh and goal_zh are Chinese.",
    "- partner_role_en, goal_en, opening, clarify_en, and rescue_en are English.",
    "- If partner_name is given, use that exact name.",
    "- Fit the role to this situation. Do not keep a job from another scene.",
    "- opening is one short English line the partner says first.",
    "- rescue_en is one simple English sentence the learner could say.",
    "- Do not put Chinese inside the English fields.",
  ].join("\n");
}

export function randomSceneSystem() {
  return [
    "Invent one spoken-English role play for everyday practice.",
    "The situation must be ordinary life, ordinary work, or casual chat.",
    "Good kinds: ordering food, a shop, the bus, asking the way, a restaurant, a pharmacy, a short talk with a coworker, weekend plans, the weather, cooking, the gym, a neighbor.",
    "Do not use rare, technical, academic, legal, medical, or dramatic situations.",
    'Return JSON only: {"title_zh": "", "description_zh": "", "partner_role_zh": "", "partner_role_en": "", "goal_zh": "", "goal_en": "", "opening": "", "clarify_en": "", "rescue_en": ""}.',
    "Rules:",
    "- Use the partner_name given in the user JSON. Do not rename them.",
    "- The role should fit this ordinary situation and this person's personality.",
    "- title_zh, description_zh, partner_role_zh, and goal_zh are Chinese.",
    "- partner_role_en, goal_en, opening, clarify_en, and rescue_en are English.",
    "- opening is one short English line the partner says first.",
    "- rescue_en is one simple English sentence the learner could say.",
    "- Do not put Chinese inside the English fields.",
    "- Avoid the titles listed in avoid_titles.",
  ].join("\n");
}
