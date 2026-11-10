import { gunzipSync } from "fflate";

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const text = new TextDecoder().decode(gunzipSync(new Uint8Array(event.data)));
    self.postMessage({ ok: true, table: JSON.parse(text) as Record<string, string[]> });
  } catch {
    self.postMessage({ ok: false });
  }
};
