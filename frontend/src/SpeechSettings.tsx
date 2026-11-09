import { FormEvent, useEffect, useState } from "react";
import { keyHint, readSpeech, regionFromEndpoint, resolveVoices, SPEECH_VENDORS, writeSpeech, type SpeechVendorId, type SpeechVoices } from "./engine/speech";
import { speak } from "./lib/speak";

const EMPTY_VOICES: SpeechVoices = {
  Mia: "en-US-JennyNeural",
  Lina: "en-US-AriaNeural",
  Sam: "en-US-GuyNeural",
  other: "en-US-JennyNeural",
};

export function SpeechSettings() {
  const [vendor, setVendor] = useState<SpeechVendorId>("azure");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState(false);
  const [hint, setHint] = useState("");
  const [voices, setVoices] = useState<SpeechVoices>(EMPTY_VOICES);
  const [voicesChecked, setVoicesChecked] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = SPEECH_VENDORS.find((item) => item.id === vendor)!;
  const parsed = regionFromEndpoint(endpoint.trim());
  const needRegion = endpoint.trim().length > 0 && !parsed;

  useEffect(() => {
    void readSpeech().then((saved) => {
      setEndpoint(saved.endpoint);
      setRegion(saved.region);
      setSavedKey(Boolean(saved.key));
      setHint(keyHint(saved.key));
      setVoices(saved.voices);
      setVoicesChecked(saved.voicesChecked);
    });
  }, []);

  function choose(next: SpeechVendorId) {
    setVendor(next);
    setError(null);
    setNotice(next === "azure" ? null : "暂未开发");
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const current = await readSpeech();
      const key = clearKey ? "" : apiKey.trim() || current.key;
      const nextEndpoint = endpoint.trim();
      if (!clearKey && (!key || !nextEndpoint)) {
        setError("填上密钥和终结点。");
        return;
      }
      if (key && !nextEndpoint.startsWith("https://")) {
        setError("终结点要以 https:// 开头。");
        return;
      }
      const located = regionFromEndpoint(nextEndpoint);
      const nextRegion = located?.region || region.trim().toLowerCase();
      if (key && !nextRegion) {
        setError("这个终结点里看不出区域，请再填区域。");
        return;
      }
      const resolved = key
        ? await resolveVoices({
            ...current,
            key,
            endpoint: nextEndpoint,
            region: nextRegion,
            china: located?.china || nextRegion.startsWith("china"),
            voicesChecked: false,
          })
        : { ...current, key: "", endpoint: nextEndpoint, region: nextRegion, voices: EMPTY_VOICES, voicesChecked: false };
      const saved = await writeSpeech(resolved);
      setEndpoint(saved.endpoint);
      setRegion(saved.region);
      setApiKey("");
      setClearKey(false);
      setSavedKey(Boolean(saved.key));
      setHint(keyHint(saved.key));
      setVoices(saved.voices);
      setVoicesChecked(saved.voicesChecked);
      setNotice(saved.key ? (saved.voicesChecked ? "已经保存，并核对了这个区域的英语嗓音。" : "已经保存。这个区域的语音清单没有读到，先用 Jenny、Aria 和 Guy。") : "语音密钥已经去掉。");
    } catch {
      setError("没有保存。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="speech-panel">
      <h2>语音</h2>
      <p className="muted">听写和朗读单独用这一家。对话用的密钥不用改。点未开发的那一行不会切换正在使用的服务。</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="settings-layout" onSubmit={(event) => void onSave(event)}>
        <div className="source-list" role="listbox" aria-label="语音服务">
          {SPEECH_VENDORS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`source-row${item.id === "azure" && savedKey ? " in-use" : ""}`}
              aria-pressed={item.id === vendor}
              data-testid={`speech-${item.id}`}
              onClick={() => choose(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.ready ? (savedKey ? "正在使用" : "未设置") : "暂未开发"}</span>
            </button>
          ))}
        </div>
        <div className="panel settings-detail">
          {selected.ready ? (
            <>
              <h2>Azure</h2>
              <p className="muted">把门户「密钥和终结点」里的地址原样贴上。Mia 用 Jenny，Lina 用 Aria，Sam 用 Guy；这个区域没有时，会换成同性别的标准英语嗓音。</p>
              <label>
                终结点
                <input
                  type="url"
                  value={endpoint}
                  placeholder="https://eastasia.api.cognitive.microsoft.com"
                  data-testid="speech-endpoint"
                  onChange={(event) => setEndpoint(event.target.value)}
                />
              </label>
              {needRegion ? (
                <label>
                  区域
                  <input
                    value={region}
                    type="text"
                    placeholder="eastasia"
                    data-testid="speech-region"
                    onChange={(event) => setRegion(event.target.value)}
                  />
                </label>
              ) : null}
              <label>
                密钥
                <input
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  placeholder={savedKey ? "留空表示用已保存的密钥" : "贴上密钥 1"}
                  data-testid="speech-key"
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setClearKey(false);
                  }}
                />
              </label>
              {savedKey ? (
                <p className="muted">
                  {clearKey ? "保存后会去掉语音密钥。" : `已经保存 ${hint}。`}
                  <button type="button" className="text-button" onClick={() => setClearKey((value) => !value)}>
                    {clearKey ? "仍保留" : "去掉密钥"}
                  </button>
                </p>
              ) : null}
              {savedKey ? (
                <p className="muted" data-testid="speech-voices">
                  Mia {voices.Mia} · Lina {voices.Lina} · Sam {voices.Sam}
                  {voicesChecked ? "" : "。清单还没核对，先用这三个。"}
                </p>
              ) : null}
              <div className="settings-actions">
                <button
                  type="button"
                  className="ghost"
                  data-testid="speech-preview"
                  disabled={!savedKey}
                  onClick={() => speak("Hi. What can I get for you?", "speech-preview", "Mia")}
                >
                  试听
                </button>
                <button className="primary" type="submit" data-testid="save-speech" disabled={saving}>
                  {saving ? "保存中…" : "保存语音"}
                </button>
              </div>
              {notice ? <p data-testid="speech-notice">{notice}</p> : null}
            </>
          ) : (
            <>
              <h2>{selected.label}</h2>
              <p data-testid="speech-unavailable">暂未开发</p>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
