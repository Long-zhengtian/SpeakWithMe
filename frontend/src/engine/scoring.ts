/** Same numbers as backend/app/domain/scoring.py. A corrected "I want coffee" totals 18. */

export const WEIGHTS: Record<string, number> = {
  accuracy: 0.4,
  vocabulary: 0.25,
  difficulty: 0.15,
  interaction: 0.2,
};

const DIMENSIONS: [string, string][] = [
  ["accuracy", "准确度"],
  ["vocabulary", "词汇"],
  ["difficulty", "难度"],
  ["interaction", "互动"],
];

const VOCABULARY_WORDS_FOR_FULL = 4;
const DIFFICULTY_WORDS_FOR_FULL = 14;
const INTERACTION_TURN_BASE = 20;
const INTERACTION_TURN_STEP = 10;
const INTERACTION_MIN_WORDS = 4;
const DAY_WEIGHT_FLOOR = 1;
const WEEK = "日一二三四五六";
const FUNCTION_WORDS = new Set(
  "a an the i you he she it we they me my your his her our their is am are was were be been do does did have has had to of in on at for and or but so if when because that this with from not no yes please just".split(
    " ",
  ),
);
const CLAUSE_MARKERS = new Set("because if when while although after before which that so".split(" "));

export type ScoreDimension = { id: string; label_zh: string; score: number };

type Line = {
  role: string;
  text: string;
  assisted?: boolean;
  correction?: { category?: string } | null;
  correction_ready?: boolean;
  correction_status?: string;
  created_at?: string;
};

type ScoredSession = {
  created_at: string;
  messages: Line[];
};

export type SessionScoreResult = {
  total: number;
  dimensions: ScoreDimension[];
  turns: number;
  own_turns: number;
  clear: number;
  corrected: number;
  categories: Record<string, number>;
  top_category: string;
};

const categoryLabels: Record<string, string> = {
  article: "冠词",
  tense: "时态",
  agreement: "一致",
  word_choice: "用词",
  word_order: "语序",
  politeness: "说法",
  other: "表达",
};

export function categoryLabel(category: string) {
  return categoryLabels[category] || category;
}

export function scoreSession(session: ScoredSession): SessionScoreResult {
  const users = session.messages.filter((message) => message.role === "user");
  const own = users.filter((message) => !message.assisted);
  const judgments = own.map(judgment).filter(Boolean);
  const clear = judgments.filter((item) => item === "clear").length;
  const corrected = judgments.filter((item) => item === "corrected").length;
  const scores: Record<string, number> = {};
  if (judgments.length) scores.accuracy = round(100 * (clear / judgments.length));
  scores.vocabulary = vocabulary(own);
  scores.difficulty = difficulty(own);
  scores.interaction = interaction(users, own);
  const dimensions = DIMENSIONS.filter(([key]) => key in scores).map(([key, label]) => ({
    id: key,
    label_zh: label,
    score: scores[key],
  }));
  const categories: Record<string, number> = {};
  for (const message of own) {
    const category = message.correction?.category || "";
    if (!category) continue;
    categories[category] = (categories[category] || 0) + 1;
  }
  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  return {
    total: weighted(scores),
    dimensions,
    turns: users.length,
    own_turns: own.length,
    clear,
    corrected,
    categories,
    top_category: top ? top[0] : "",
  };
}

export type DayMark = {
  date: string;
  label: string;
  today: boolean;
  sessions: number;
  turns: number;
  score: number | null;
  summary: string;
  dimensions: ScoreDimension[];
};

export function progressCalendar(sessions: ScoredSession[], today = localToday(), days = 14) {
  const grouped = new Map<string, ScoredSession[]>();
  const practiced = new Set<string>();
  for (const session of sessions) {
    const byDay = new Map<string, Line[]>();
    for (const message of session.messages) {
      if (message.role !== "user") continue;
      const day = localDate(message.created_at || session.created_at);
      if (!day) continue;
      const lines = byDay.get(day) || [];
      lines.push(message);
      byDay.set(day, lines);
    }
    for (const [day, lines] of byDay) {
      practiced.add(day);
      const list = grouped.get(day) || [];
      list.push({ created_at: lines[0].created_at || session.created_at, messages: lines });
      grouped.set(day, list);
    }
  }
  const marks: DayMark[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = addDays(today, -offset);
    marks.push(dayMark(day, grouped.get(day) || [], day === today));
  }
  const streakInfo = streaks(practiced, today);
  return { ...streakInfo, days: marks };
}

function judgment(message: Line) {
  if (message.assisted) return "";
  const status = message.correction_status || "";
  if (status === "failed") return "";
  if (status === "corrected" || message.correction) return "corrected";
  if (status === "clear" || (message.correction_ready && !message.correction)) return "clear";
  return "";
}

function vocabulary(own: Line[]) {
  if (!own.length) return 0;
  const content = new Set<string>();
  for (const message of own) {
    for (const word of words(message.text)) {
      if (!FUNCTION_WORDS.has(word) && word.length > 1) content.add(word);
    }
  }
  return clamp(round(100 * (content.size / own.length / VOCABULARY_WORDS_FOR_FULL)));
}

function difficulty(own: Line[]) {
  if (!own.length) return 0;
  let tokens = 0;
  let clauses = 0;
  for (const message of own) {
    const line = words(message.text);
    tokens += line.length;
    clauses += line.filter((word) => CLAUSE_MARKERS.has(word)).length;
  }
  const average = tokens / own.length;
  const length = Math.min(1, average / DIFFICULTY_WORDS_FOR_FULL);
  const clause = Math.min(1, clauses / own.length);
  return clamp(round(100 * (0.7 * length + 0.3 * clause)));
}

function interaction(users: Line[], own: Line[]) {
  if (!users.length) return 0;
  const turnScore = Math.min(100, INTERACTION_TURN_BASE + users.length * INTERACTION_TURN_STEP);
  const pool = own.length ? own : users;
  const substantial = pool.filter((message) => words(message.text).length >= INTERACTION_MIN_WORDS).length;
  const substance = (100 * substantial) / pool.length;
  return clamp(round(0.5 * turnScore + 0.5 * substance));
}

function weighted(scores: Record<string, number>) {
  const chosen = Object.keys(WEIGHTS)
    .filter((key) => key in scores)
    .map((key) => [scores[key], WEIGHTS[key]] as const);
  if (!chosen.length) return 0;
  const totalWeight = chosen.reduce((sum, [, weight]) => sum + weight, 0);
  return clamp(round(chosen.reduce((sum, [score, weight]) => sum + score * weight, 0) / totalWeight));
}

function dayMark(day: string, sessions: ScoredSession[], isToday: boolean): DayMark {
  const scored = sessions.map((session) => {
    const result = scoreSession(session);
    return { result, weight: Math.max(DAY_WEIGHT_FLOOR, result.own_turns) };
  });
  const mark: DayMark = {
    date: day,
    label: WEEK[new Date(`${day}T12:00:00`).getDay()],
    today: isToday,
    sessions: sessions.length,
    turns: scored.reduce((sum, item) => sum + item.result.turns, 0),
    score: null,
    summary: "",
    dimensions: [],
  };
  if (!scored.length) return mark;
  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0);
  mark.score = clamp(round(scored.reduce((sum, item) => sum + item.result.total * item.weight, 0) / totalWeight));
  mark.dimensions = averageDimensions(scored);
  mark.summary = summary(day, isToday, scored);
  return mark;
}

function averageDimensions(scored: { result: SessionScoreResult; weight: number }[]) {
  const averaged: ScoreDimension[] = [];
  for (const [key, label] of DIMENSIONS) {
    const chosen = scored.filter((item) => item.result.dimensions.some((dimension) => dimension.id === key));
    if (!chosen.length) continue;
    const weightSum = chosen.reduce((sum, item) => sum + item.weight, 0);
    const value = chosen.reduce((sum, item) => sum + dimensionScore(item.result, key) * item.weight, 0) / weightSum;
    averaged.push({ id: key, label_zh: label, score: clamp(round(value)) });
  }
  return averaged;
}

function dimensionScore(result: SessionScoreResult, key: string) {
  return result.dimensions.find((item) => item.id === key)?.score ?? 0;
}

function summary(_day: string, _isToday: boolean, scored: { result: SessionScoreResult }[]) {
  const turns = scored.reduce((sum, item) => sum + item.result.turns, 0);
  const clear = scored.reduce((sum, item) => sum + item.result.clear, 0);
  const corrected = scored.reduce((sum, item) => sum + item.result.corrected, 0);
  const head = `${scored.length} 场，说了 ${turns} 句`;
  const judged = clear + corrected;
  let middle = "";
  if (judged && clear === judged) middle = turns === 1 ? "，这句不用改" : "，这几句都不用改";
  else if (judged && clear === 0) middle = turns === 1 ? "，这句被改过" : "，这几句都被改过";
  else if (judged) middle = `，其中 ${clear} 句不用改`;
  const categories: Record<string, number> = {};
  for (const item of scored) {
    for (const [category, count] of Object.entries(item.result.categories)) {
      categories[category] = (categories[category] || 0) + count;
    }
  }
  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  const tail = top && corrected ? `，改得最多的是${categoryLabel(top[0])}` : "";
  return `${head}${middle}${tail}。`;
}

function streaks(dates: Set<string>, today: string) {
  const spokeToday = dates.has(today);
  let cursor = spokeToday ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  const ordered = [...dates].sort();
  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of ordered) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { streak, best, practice_days: dates.size, spoke_today: spokeToday };
}

function words(text: string) {
  return (text.toLowerCase().match(/[a-z']+/g) || []);
}

function localDate(iso: string) {
  const text = (iso || "").trim();
  if (!text) return "";
  const parsed = new Date(text.endsWith("Z") || /[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const date = `${parsed.getDate()}`.padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${date}`;
}

function localToday() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const date = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${date}`;
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const value = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${value}`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function round(value: number) {
  return Math.floor(value + 0.5);
}
