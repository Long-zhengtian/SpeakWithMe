const CATEGORIES: Record<string, string> = {
  article: "冠词",
  tense: "时态",
  agreement: "一致",
  word_choice: "用词",
  word_order: "语序",
  politeness: "说法",
  other: "表达",
};

export function categoryLabel(category: string) {
  return CATEGORIES[category] ?? category;
}
