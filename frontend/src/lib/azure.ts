import { readSpeech, regionFromEndpoint } from "../engine/speech";

export async function openSpeech() {
  const saved = await readSpeech();
  if (!saved.key || !saved.endpoint) throw new Error("先在设置的语音里填上 Azure 密钥和终结点。");
  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const located = regionFromEndpoint(saved.endpoint);
  const region = located?.region || saved.region;
  const china = located?.china || saved.china;
  const config = region
    ? china
      ? sdk.SpeechConfig.fromHost(new URL(`https://${region}.api.cognitive.azure.cn`), saved.key)
      : sdk.SpeechConfig.fromSubscription(saved.key, region)
    : sdk.SpeechConfig.fromEndpoint(new URL(saved.endpoint), saved.key);
  return { sdk, config, saved };
}

export function speechFailure(details: string, kind: "朗读" | "听写") {
  const text = details.replace(/\s+/g, " ").trim();
  if (/密钥|终结点/.test(text)) return text;
  if (/401|403|unauthorized|authentication/i.test(text)) return "语音密钥没有被接受。";
  if (/1006|websocket|unable to contact|network|timeout|unreachable/i.test(text)) return `${kind}暂时连不上 Azure。`;
  return text ? `${kind}没有完成：${text.slice(0, 140)}` : `${kind}没有准备好，稍后再点一次。`;
}
