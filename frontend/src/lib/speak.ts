import { voiceFor } from "../engine/speech";
import { openSpeech, speechFailure } from "./azure";
import { speechError, speechStatus } from "./speechNotice";

type Listener = (key: string | null) => void;
type Closable = { close: () => void };

let activeKey: string | null = null;
let generation = 0;
let current: Closable | null = null;
let player: HTMLAudioElement | null = null;
let playerUrl: string | null = null;
const listeners = new Set<Listener>();

function publish(key: string | null) {
  activeKey = key;
  listeners.forEach((listener) => listener(key));
}

function stopPlayer() {
  if (player) {
    player.onended = null;
    player.onerror = null;
    player.pause();
    player.src = "";
    player = null;
  }
  if (playerUrl) {
    URL.revokeObjectURL(playerUrl);
    playerUrl = null;
  }
}

function audioType(bytes: ArrayBuffer) {
  const head = new Uint8Array(bytes.slice(0, 4));
  const mark = String.fromCharCode(head[0], head[1], head[2], head[3]);
  if (mark === "RIFF") return "audio/wav";
  if (mark.startsWith("ID3") || head[0] === 0xff) return "audio/mpeg";
  return "audio/wav";
}

function playAudio(bytes: ArrayBuffer, mine: number, token: string) {
  stopPlayer();
  const url = URL.createObjectURL(new Blob([bytes], { type: audioType(bytes) }));
  const audio = new Audio(url);
  player = audio;
  playerUrl = url;
  let reported = false;
  const fail = () => {
    if (reported || generation !== mine) return;
    reported = true;
    stopPlayer();
    publish(null);
    speechError("朗读没有准备好，稍后再点一次。");
  };
  audio.onended = () => {
    if (generation !== mine || activeKey !== token) return;
    stopPlayer();
    publish(null);
  };
  audio.onerror = fail;
  void audio.play().catch(fail);
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
  stopPlayer();
  publish(token);
  void runSpeak(text, mine, token, partnerName);
  return true;
}

async function runSpeak(text: string, mine: number, token: string, partnerName?: string) {
  try {
    const { sdk, config, saved } = await openSpeech();
    if (generation !== mine) return;
    config.speechSynthesisVoiceName = voiceFor(saved, partnerName);
    const synthesizer = new sdk.SpeechSynthesizer(config, null);
    current = synthesizer;
    const audio = await new Promise<ArrayBuffer>((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          const bytes = result.audioData;
          synthesizer.close();
          if (current === synthesizer) current = null;
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted && bytes && bytes.byteLength > 16) resolve(bytes);
          else reject(new Error(speechFailure(result.errorDetails || "", "朗读")));
        },
        (error) => {
          synthesizer.close();
          if (current === synthesizer) current = null;
          reject(new Error(speechFailure(typeof error === "string" ? error : "", "朗读")));
        },
      );
    });
    if (generation !== mine) return;
    playAudio(audio, mine, token);
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
  stopPlayer();
  try {
    current?.close();
  } catch {
    // The synthesizer may already have finished.
  }
  current = null;
  speechStatus(null);
  publish(null);
}
