import { scoreSession } from "../src/engine/scoring.ts";

const scored = scoreSession({
  created_at: "2026-11-07T02:00:00+00:00",
  messages: [
    {
      role: "user",
      text: "I want coffee",
      correction: { category: "politeness" },
      correction_ready: true,
      correction_status: "corrected",
    },
  ],
});
const byId = Object.fromEntries(scored.dimensions.map((item) => [item.id, item.score]));
if (byId.accuracy !== 0 || byId.vocabulary !== 50 || byId.difficulty !== 15 || byId.interaction !== 15 || scored.total !== 18) {
  console.error(scored);
  process.exit(1);
}
console.log("score 18 ok");
