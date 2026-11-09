import { EngineError, JSON_ATTEMPTS, parseJsonObject } from "./text";

export type ChatTurn = { role: string; content: string };

type CompleteInput = {
  system: string;
  messages: ChatTurn[];
  task: string;
  json: boolean;
};

export async function complete(baseUrl: string, apiKey: string, model: string, input: CompleteInput) {
  const payload: Record<string, unknown> = {
    model,
    temperature: input.task === "chat" ? 0.7 : 0.2,
    max_tokens: input.task === "chat" ? 180 : 400,
    messages: [{ role: "system", content: input.system }, ...input.messages],
  };
  if (input.json) payload.response_format = { type: "json_object" };
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(40000),
    });
  } catch {
    throw new EngineError(502, "llm_unavailable", "模型没有连上，再试一次。");
  }
  if (!response.ok) throw new EngineError(502, "llm_unavailable", "模型没有连上，再试一次。");
  let body: { choices?: { message?: { content?: string } }[] };
  try {
    body = await response.json();
  } catch {
    throw new EngineError(502, "llm_unavailable", "模型没有连上，再试一次。");
  }
  return body.choices?.[0]?.message?.content || "";
}

export async function completeJson(baseUrl: string, apiKey: string, model: string, system: string, messages: ChatTurn[], task: string) {
  let last = "";
  let current = messages;
  for (let attempt = 0; attempt < JSON_ATTEMPTS; attempt += 1) {
    last = await complete(baseUrl, apiKey, model, { system, messages: current, task, json: true });
    try {
      return parseJsonObject(last);
    } catch {
      current = [
        ...messages,
        { role: "assistant", content: last.slice(0, 2000) },
        { role: "user", content: "That was not a JSON object. Return one JSON object only, with no other text." },
      ];
    }
  }
  throw new EngineError(502, "bad_json", "模型没有返回可用的内容。");
}
