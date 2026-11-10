import { EngineError, JSON_ATTEMPTS, parseJsonObject } from "./text";

export type ChatTurn = { role: string; content: string };

type CompleteInput = {
  system: string;
  messages: ChatTurn[];
  task: string;
  json: boolean;
};

function asksDeepSeek(baseUrl: string, model: string) {
  return /api\.deepseek\.com/i.test(baseUrl) || /^deepseek/i.test(model);
}

async function postChat(url: string, apiKey: string, payload: Record<string, unknown>) {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(40000),
    });
  } catch {
    throw new EngineError(502, "llm_unavailable", "模型没有连上，再试一次。");
  }
}

type Completion = { content: string; finishReason: string };

async function requestCompletion(baseUrl: string, apiKey: string, model: string, input: CompleteInput, maxTokens: number): Promise<Completion> {
  const payload: Record<string, unknown> = {
    model,
    temperature: input.task === "chat" ? 0.7 : 0.2,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: input.system }, ...input.messages],
  };
  if (input.json) payload.response_format = { type: "json_object" };
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const deepseek = asksDeepSeek(baseUrl, model);
  if (deepseek) payload.thinking = { type: "disabled" };
  let response = await postChat(url, apiKey, payload);
  if (deepseek && response.status === 400) {
    const detail = await response.text();
    if (!/thinking/i.test(detail)) throw new EngineError(502, "llm_unavailable", "模型没有连上，再试一次。");
    delete payload.thinking;
    response = await postChat(url, apiKey, payload);
  }
  if (!response.ok) throw new EngineError(502, "llm_unavailable", "模型没有连上，再试一次。");
  let body: { choices?: { finish_reason?: string; message?: { content?: string } }[] };
  try {
    body = await response.json();
  } catch {
    throw new EngineError(502, "llm_unavailable", "模型没有连上，再试一次。");
  }
  const choice = body.choices?.[0];
  return { content: choice?.message?.content || "", finishReason: choice?.finish_reason || "" };
}

export async function complete(baseUrl: string, apiKey: string, model: string, input: CompleteInput) {
  const spoken = input.task === "chat";
  let result = await requestCompletion(baseUrl, apiKey, model, input, spoken ? 180 : 1200);
  if (result.finishReason === "length") {
    result = await requestCompletion(baseUrl, apiKey, model, input, spoken ? 480 : 2400);
  }
  if (result.finishReason === "length") throw new EngineError(502, "llm_truncated", "模型这次没写完，再试一次。");
  return result.content;
}

export async function completeJson(baseUrl: string, apiKey: string, model: string, system: string, messages: ChatTurn[], task: string) {
  let last = "";
  let current = messages;
  for (let attempt = 0; attempt < JSON_ATTEMPTS; attempt += 1) {
    last = await complete(baseUrl, apiKey, model, { system, messages: current, task, json: true });
    try {
      return parseJsonObject(last);
    } catch {
      current = [...messages, { role: "user", content: "That was not a JSON object. Return one JSON object only, with no other text." }];
    }
  }
  throw new EngineError(502, "bad_json", "模型没有返回可用的内容。");
}
