import { loadKokoro, speechError, speechStatus } from "./models";

type Listener = (key: string | null) => void;

let activeKey: string | null = null;
let generation = 0;
let audioContext: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
const listeners = new Set<Listener>();

function publish(key: string | null) {
  activeKey = key;
  listeners.forEach((listener) => listener(key));
}

export function canSpeak() {
  return typeof window !== "undefined" && typeof AudioContext !== "undefined";
}

export function subscribeSpeaking(listener: Listener) {
  listeners.add(listener);
  listener(activeKey);
  return () => {
    listeners.delete(listener);
  };
}

export function speak(text: string, key = "") {
  if (!canSpeak() || !text.trim()) return false;
  const token = key || text;
  if (activeKey === token) {
    stopSpeaking();
    return true;
  }
  const mine = ++generation;
  publish(token);
  void runSpeak(text, mine, token);
  return true;
}

async function runSpeak(text: string, mine: number, token: string) {
  try {
    speechStatus("正在准备朗读…");
    const voice = await loadKokoro();
    if (generation !== mine) return;
    const audio = await voice.generate(text, { voice: "af_heart", speed: 1 });
    if (generation !== mine) return;
    speechStatus(null);
    await play(audio.audio, audio.sampling_rate, mine, token);
  } catch {
    if (generation !== mine) return;
    speechStatus(null);
    publish(null);
    speechError("朗读没有准备好，稍后再点一次。");
  }
}

function play(samples: Float32Array, rate: number, mine: number, token: string) {
  audioContext ??= new AudioContext();
  const context = audioContext;
  if (context.state === "suspended") void context.resume();
  const buffer = context.createBuffer(1, samples.length, rate);
  const channel = new Float32Array(samples.length);
  channel.set(samples);
  buffer.copyToChannel(channel, 0);
  source?.stop();
  const node = context.createBufferSource();
  source = node;
  node.buffer = buffer;
  node.connect(context.destination);
  return new Promise<void>((resolve) => {
    node.onended = () => {
      if (generation === mine && activeKey === token) publish(null);
      resolve();
    };
    node.start();
  });
}

export function stopSpeaking() {
  generation += 1;
  try {
    source?.stop();
  } catch {
    // The buffer may already have finished.
  }
  source = null;
  speechStatus(null);
  publish(null);
}
