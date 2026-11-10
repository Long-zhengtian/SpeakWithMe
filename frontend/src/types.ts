export type LevelInfo = {
  id: string;
  label_zh: string;
  hint_zh: string;
};

export type Scene = {
  id: string;
  title: string;
  title_zh: string;
  description_zh: string;
  partner_name: string;
  partner_role_zh: string;
  goal_zh: string;
  opening: string;
};

export type LlmProviderSetting = {
  id: string;
  label: string;
  base_url: string;
  model: string;
  custom_url: boolean;
  api_key_set: boolean;
  api_key_hint: string;
  models: string[];
};

export type LlmSettings = {
  provider: string;
  base_url: string;
  model: string;
  api_key_set: boolean;
  api_key_hint: string;
  providers: LlmProviderSetting[];
};

export type Partner = {
  id: string;
  name: string;
  personality_zh: string;
};

export type HomePlace = {
  id: string;
  kind: "builtin" | "custom";
  title_zh: string;
  description_zh: string;
  partner_id: string;
  partner_name: string;
  partner_role_zh: string;
};

export type Places = {
  pins: HomePlace[];
  shelf: HomePlace[];
};

export type Catalog = {
  levels: LevelInfo[];
  scenes: Scene[];
  partners: Partner[];
};

export type Correction = {
  original_span: string;
  suggestion: string;
  category: string;
  explanation_zh: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | string;
  text: string;
  assisted: boolean;
  correction: Correction | null;
  correction_status?: "" | "clear" | "failed" | "corrected";
  translation_zh?: string;
};

export type Session = {
  id: string;
  level: string;
  scene: Scene;
  messages: ChatMessage[];
  finished_at: string | null;
  recap: Recap | null;
  corrections_enabled: boolean;
  partner_id?: string;
  pinned?: boolean;
  ending?: boolean;
};

export type CoachLine = {
  sentence: string;
  simpler: string;
  gloss_zh: string;
};

export type Recap = {
  went_well: string[];
  try_next: string;
  keep_sentence: string;
  revised_from: string;
};

export type ScoreDimension = {
  id: string;
  label_zh: string;
  score: number;
};

export type SessionScore = {
  total: number;
  dimensions: ScoreDimension[];
};

export type DayScore = {
  date: string;
  label: string;
  today: boolean;
  sessions: number;
  turns: number;
  score: number | null;
  summary: string;
  dimensions: ScoreDimension[];
};

export type PracticeProgress = {
  streak: number;
  best: number;
  practice_days: number;
  spoke_today: boolean;
  days: DayScore[];
};

export type Profile = {
  stats: {
    sessions: number;
    user_turns: number;
    corrections: number;
    assisted_turns: number;
  };
  focus: { category: string; label_zh: string; count: number }[];
  recent_corrections: {
    suggestion: string;
    explanation_zh: string;
    category: string;
    label_zh: string;
    scene_title_zh: string;
  }[];
  latest_feedback: {
    scene_title_zh: string;
    finished_at: string;
    went_well: string[];
    try_next: string;
    keep_sentence: string;
    revised_from: string;
  } | null;
  records: PracticeRecord[];
  activity: { at: string }[];
  progress?: PracticeProgress;
};

export type PracticeRecord = {
  id: string;
  scene_title_zh: string;
  partner_name: string;
  level: string;
  created_at: string;
  finished_at: string | null;
  ending?: boolean;
  user_turns: number;
  correction_count: number;
  assisted_turns: number;
  try_next: string | null;
  preview: string;
  score?: SessionScore | null;
};

export type Gloss = {
  text: string;
  gloss_zh: string;
  phonetic: string;
  definitions: string[];
  lemma: string;
};

export type Phrase = {
  id: string;
  kind: "word" | "sentence" | string;
  text: string;
  gloss_zh: string;
  created_at: string;
  learning_status?: "learning" | "mastered" | string;
  original_text?: string;
  category?: string;
};
