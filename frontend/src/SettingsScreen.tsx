import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "./api/client";
import type { LlmSettings } from "./types";

type SettingsScreenProps = {
  onKeyChange: (apiKeySet: boolean) => void;
};

export function SettingsScreen({ onKeyChange }: SettingsScreenProps) {
  const [saved, setSaved] = useState<LlmSettings | null>(null);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [filter, setFilter] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .settings()
      .then((next) => {
        if (!alive) return;
        setSaved(next);
        onKeyChange(next.api_key_set);
        setProvider(next.provider);
        setModel(next.model);
        setBaseUrl(next.base_url);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "设置没有打开。");
      });
    return () => {
      alive = false;
    };
  }, []);

  const selected = saved?.providers.find((item) => item.id === provider);
  const models = selected?.models ?? [];
  const visibleModels = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return models;
    return models.filter((item) => item.toLowerCase().includes(query));
  }, [filter, models]);

  function chooseProvider(nextId: string) {
    const item = saved?.providers.find((entry) => entry.id === nextId);
    setProvider(nextId);
    setModel(item?.model ?? "");
    setBaseUrl(item?.base_url ?? "");
    setApiKey("");
    setFilter("");
    setClearApiKey(false);
    setNotice(null);
    setError(null);
  }

  async function onLoadModels() {
    setLoadingModels(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.listModels({ provider, baseUrl, apiKey });
      setSaved(next);
      const item = next.providers.find((entry) => entry.id === provider);
      setModel(item?.model && item.models.includes(item.model) ? item.model : "");
      setApiKey("");
      setClearApiKey(false);
      setNotice(item?.models.length ? `读到 ${item.models.length} 个模型。选一个再保存。` : "这个地址没有返回模型。");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有读到模型。");
    } finally {
      setLoadingModels(false);
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!model) {
      setError("先从列表里选一个模型。");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.saveSettings({ provider, baseUrl, model, apiKey, clearApiKey });
      setSaved(next);
      setProvider(next.provider);
      setModel(next.model);
      setBaseUrl(next.base_url);
      setApiKey("");
      setClearApiKey(false);
      onKeyChange(next.api_key_set);
      setNotice(next.api_key_set ? "已经保存。下一场对话会用这个模型和密钥。" : "这个来源的密钥已经去掉。");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "没有保存。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <h1>设置</h1>
          <p className="lede">每一家的地址、密钥和模型都会留着。点另一家只是去看它，保存之后练习才改用那一家。</p>
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!saved || !selected ? (
        <p className="muted">{error ? "检查后端是否在 8000 端口。" : "正在读取设置…"}</p>
      ) : (
        <form className="settings-layout" onSubmit={onSave}>
          <div className="source-list" role="listbox" aria-label="密钥来源">
            {saved.providers.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`source-row${item.id === saved.provider ? " in-use" : ""}`}
                aria-pressed={item.id === provider}
                data-testid={`provider-${item.id}`}
                onClick={() => chooseProvider(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{sourceStatus(item, saved.provider)}</span>
              </button>
            ))}
          </div>
          <div className="panel settings-detail">
            <h2>{selected.label}</h2>
            <p className="muted">
              {provider === saved.provider
                ? "现在练习用的是这一家。其他来源已经保存的密钥和模型还在，点左边可以再选。"
                : selected.api_key_set
                  ? "这一家的密钥还在。保存之后练习会改用它，刚才那一家不会被清掉。"
                  : "保存之后练习会改用这一家。其他来源已经保存的内容还在。"}
            </p>
            {selected.custom_url ? (
              <>
                <label htmlFor="base-url">接口地址</label>
                <input
                  id="base-url"
                  type="url"
                  data-testid="base-url"
                  value={baseUrl}
                  placeholder="https://example.com/v1"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </>
            ) : (
              <p className="muted">模型从 {selected.base_url}/models 读取。</p>
            )}
            <label htmlFor="api-key">API key</label>
            <input
              id="api-key"
              type="password"
              data-testid="api-key"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              placeholder={selected.api_key_set ? "留空表示用已保存的密钥" : "贴上这一家的密钥"}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (event.target.value.trim()) setClearApiKey(false);
              }}
            />
            {selected.api_key_set ? (
              <p className="muted">
                {clearApiKey ? "保存后会去掉这一家的密钥。" : `已经保存 ${selected.api_key_hint}。`}
                <button
                  type="button"
                  className="text-button"
                  data-testid="clear-api-key"
                  onClick={() => {
                    setClearApiKey(true);
                    setApiKey("");
                  }}
                >
                  去掉密钥
                </button>
              </p>
            ) : (
              <p className="muted">密钥保存后只显示末尾几位。</p>
            )}
            <div className="settings-actions">
              <button type="button" className="ghost" data-testid="load-models" disabled={loadingModels || saving} onClick={() => void onLoadModels()}>
                {loadingModels ? "正在读取…" : "读取模型"}
              </button>
              <button type="submit" className="primary" data-testid="save-settings" disabled={saving || loadingModels || !model}>
                {saving ? "正在保存…" : "保存"}
              </button>
            </div>
            <label htmlFor="model-filter">模型</label>
            <input
              id="model-filter"
              type="text"
              value={filter}
              placeholder={models.length ? "筛选模型" : "读取之后会出现在这里"}
              onChange={(event) => setFilter(event.target.value)}
            />
            {models.length === 0 ? (
              <p className="muted">还没有读到模型。</p>
            ) : visibleModels.length === 0 ? (
              <p className="muted">没有符合筛选的模型。</p>
            ) : (
              <div className="model-list" data-testid="model-list">
                {visibleModels.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="model-row"
                    aria-pressed={item === model}
                    onClick={() => setModel(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
            {notice ? <p data-testid="settings-notice">{notice}</p> : null}
          </div>
        </form>
      )}
    </main>
  );
}

function sourceStatus(item: LlmSettings["providers"][number], activeId: string) {
  const using = item.id === activeId;
  if (using && item.model) return `正在使用 · ${item.model}`;
  if (using) return "正在使用";
  if (item.model && item.api_key_set) return `已保存 · ${item.model}`;
  if (item.api_key_set) return "已保存密钥";
  return "未设置";
}
