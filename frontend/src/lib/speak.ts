import { voiceFor } from "../engine/speech";
import { openSpeech, speechFailure } from "./azure";
import { speechError, speechStatus } from "./speechNotice";

type Listener = (key: string | null) => void;
type Closable = { close: () => void };

let activeKey: string | null = null;
let generation = 0;
let current: Closable | null = null;
const listeners = new Set<Listener>();

function publish(key: string | null) {
  activeKey = key;
  listeners.forEach((listener) => listener(key));
}

export function canSpeak() {
  return typeof window !== "undefined";
}

export function subscribeSpeaking(listener: Listener) {
  listeners.add(listener);
  listener(activeKey);
  return () => {
    listeners.delete(listener);
  };
}

export function speak(text: string, key = "", partnerName?: string) {
  if (!canSpeak() || !text.trim()) return false;
  const token = key || text;
  if (activeKey === token) {
    stopSpeaking();
    return true;
  }
  const mine = ++generation;
  publish(token);
  void runSpeak(text, mine, token, partnerName);
  return true;
}

async function runSpeak(text: string, mine: number, token: string, partnerName?: string) {
  try {
    speechStatus("正在准备朗读…");
    const { sdk, config, saved } = await openSpeech();
    if (generation !== mine) return;
    config.speechSynthesisVoiceName = voiceFor(saved, partnerName);
    const synthesizer = new sdk.SpeechSynthesizer(config);
    current = synthesizer;
    speechStatus(null);
    await new Promise<void>((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          const done = result.reason === sdk.ResultReason.SynthesizingAudioCompleted;
          synthesizer.close();
          if (current === synthesizer) current = null;
          if (done) resolve();
          else reject(new Error(speechFailure(result.errorDetails || "", "朗读")));
        },
        (error) => {
          synthesizer.close();
          if (current === synthesizer) current = null;
          reject(new Error(speechFailure(typeof error === "string" ? error : "", "朗读")));
        },
      );
    });
    if (generation === mine && activeKey === token) publish(null);
  } catch (error) {
    if (generation !== mine) return;
    speechStatus(null);
    publish(null);
    const message = error instanceof Error ? error.message : "";
    speechError(message || "朗读没有准备好，稍后再点一次。");
  }
}

export function stopSpeaking() {
  generation += 1;
  try {
    current?.close();
  } catch {
    // The synthesizer may already have finished.
  }
  current = null;
  speechStatus(null);
  publish(null);
}
