import { store } from "./store";

export const SPEECH_VENDORS = [
  { id: "azure", label: "Azure", ready: true },
  { id: "tencent", label: "腾讯云", ready: false },
  { id: "aliyun", label: "阿里云", ready: false },
] as const;

export type SpeechVendorId = (typeof SPEECH_VENDORS)[number]["id"];

export type SpeechVoices = {
  Mia: string;
  Lina: string;
  Sam: string;
  other: string;
};

export type SpeechSettings = {
  provider: "azure";
  key: string;
  endpoint: string;
  region: string;
  china: boolean;
  voices: SpeechVoices;
  voicesChecked: boolean;
};

const PREFERRED: SpeechVoices = {
  Mia: "en-US-JennyNeural",
  Lina: "en-US-AriaNeural",
  Sam: "en-US-GuyNeural",
  other: "en-US-JennyNeural",
};

const REGIONS = new Set([
  "eastus",
  "eastus2",
  "westus",
  "westus2",
  "westus3",
  "centralus",
  "northcentralus",
  "southcentralus",
  "westcentralus",
  "canadacentral",
  "canadaeast",
  "brazilsouth",
  "northeurope",
  "westeurope",
  "uksouth",
  "ukwest",
  "francecentral",
  "germanywestcentral",
  "switzerlandnorth",
  "norwayeast",
  "swedencentral",
  "polandcentral",
  "italynorth",
  "spaincentral",
  "eastasia",
  "southeastasia",
  "japaneast",
  "japanwest",
  "koreacentral",
  "centralindia",
  "southindia",
  "australiaeast",
  "uaenorth",
  "southafricanorth",
  "qatarcentral",
  "chinaeast2",
  "chinanorth",
  "chinanorth2",
  "chinanorth3",
]);

const EMPTY: SpeechSettings = {
  provider: "azure",
  key: "",
  endpoint: "",
  region: "",
  china: false,
  voices: { ...PREFERRED },
  voicesChecked: false,
};

export function keyHint(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length < 8) return "已保存";
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}

export function regionFromEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const region = host.split(".")[0];
  if (!REGIONS.has(region)) return null;
  return { region, china: host.endsWith(".cn") };
}

export async function readSpeech() {
  const stored = await store.get<SpeechSettings>("meta", "speech");
  return normalize(stored || EMPTY);
}

export async function writeSpeech(settings: SpeechSettings) {
  const next = normalize(settings);
  await store.put("meta", "speech", next);
  return next;
}

export function voiceFor(settings: SpeechSettings, partnerName?: string) {
  if (partnerName === "Sam") return settings.voices.Sam;
  if (partnerName === "Lina") return settings.voices.Lina;
  if (partnerName === "Mia") return settings.voices.Mia;
  return settings.voices.other;
}

export async function resolveVoices(settings: SpeechSettings) {
  const located = regionFromEndpoint(settings.endpoint);
  const region = located?.region || settings.region.trim().toLowerCase();
  const china = located?.china || settings.china || region.startsWith("china");
  if (!region) {
    return { ...settings, region: "", china, voices: { ...PREFERRED }, voicesChecked: false };
  }
  const host = china ? "tts.speech.azure.cn" : "tts.speech.microsoft.com";
  try {
    const response = await fetch(`https://${region}.${host}/cognitiveservices/voices/list`, {
      headers: { "Ocp-Apim-Subscription-Key": settings.key },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(String(response.status));
    const list = (await response.json()) as Array<{ ShortName?: string; Gender?: string; Locale?: string }>;
    const voices = {
      Mia: choose(list, PREFERRED.Mia, "Female"),
      Lina: choose(list, PREFERRED.Lina, "Female"),
      Sam: choose(list, PREFERRED.Sam, "Male"),
      other: choose(list, PREFERRED.other, "Female"),
    };
    return { ...settings, region, china, voices, voicesChecked: true };
  } catch {
    return { ...settings, region, china, voices: { ...PREFERRED }, voicesChecked: false };
  }
}

function choose(list: Array<{ ShortName?: string; Gender?: string; Locale?: string }>, preferred: string, gender: "Female" | "Male") {
  if (list.some((item) => item.ShortName === preferred)) return preferred;
  const found = list.find(
    (item) =>
      item.Locale === "en-US" &&
      item.Gender === gender &&
      item.ShortName &&
      !item.ShortName.includes("DragonHD") &&
      !item.ShortName.includes("Multilingual"),
  );
  return found?.ShortName || preferred;
}

function normalize(record: SpeechSettings): SpeechSettings {
  const endpoint = (record.endpoint || "").trim().replace(/\/$/, "");
  const located = regionFromEndpoint(endpoint);
  return {
    provider: "azure",
    key: record.key || "",
    endpoint,
    region: located?.region || (record.region || "").trim().toLowerCase(),
    china: located?.china || Boolean(record.china),
    voices: {
      Mia: record.voices?.Mia || PREFERRED.Mia,
      Lina: record.voices?.Lina || PREFERRED.Lina,
      Sam: record.voices?.Sam || PREFERRED.Sam,
      other: record.voices?.other || PREFERRED.other,
    },
    voicesChecked: Boolean(record.voicesChecked),
  };
}
