import { FormEvent, useEffect, useState } from "react";
import { ApiError, api, subscribePractice } from "./api/client";
import { RadarScore } from "./RadarScore";
import { formatWhen } from "./lib/time";
import type { PracticeRecord } from "./types";

type RecordsScreenProps = {
  onOpen: (sessionId: string, finished: boolean) => void;
};

export function RecordsScreen({ onOpen }: RecordsScreenProps) {
  const [records, setRecords] = useState<PracticeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    function load() {
      api
        .profile()
        .then((profile) => {
          if (alive) setRecords(profile.records);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setError(err instanceof ApiError ? err.message : "练习记录没有加载出来。");
        });
    }
    load();
    const stop = subscribePractice(load);
    return () => {
      alive = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!menuId && !confirmingId) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".record-menu") || target.closest(".record-more")) return;
      setMenuId(null);
      setConfirmingId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuId, confirmingId]);

  function beginRename(record: PracticeRecord) {
    setError(null);
    setMenuId(null);
    setConfirmingId(null);
    setRenamingId(record.id);
    setTitleDraft(record.scene_title_zh);
  }

  async function saveRename(event: FormEvent, recordId: string) {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!title) {
      setError("先写一个名字。");
      return;
    }
    setBusyId(recordId);
    setError(null);
    try {
      const session = await api.renameSession(recordId, title);
      setRecords((current) =>
        current
          ? current.map((item) => (item.id === recordId ? { ...item, scene_title_zh: session.scene.title_zh } : item))
          : current,
      );
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "名字没有改成。");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(recordId: string) {
    setBusyId(recordId);
    setError(null);
    try {
      await api.deleteSession(recordId);
      setRecords((current) => (current ? current.filter((item) => item.id !== recordId) : current));
      setConfirmingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场没有删掉。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <h1>记录</h1>
          {records && records.length > 0 ? <p className="lede">一共 {records.length} 场。</p> : null}
          {!records ? <p className="lede">正在整理记录…</p> : null}
        </div>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {records && records.length === 0 ? (
        <p className="muted">说完一句就会出现在这里。只打开场景、还没开口的不会记。</p>
      ) : null}
      {records && records.length > 0 ? (
        <div className="records" data-testid="records-page">
          {records.map((record) => {
            const renaming = renamingId === record.id;
            const menuOpen = menuId === record.id || confirmingId === record.id;
            return (
              <article key={record.id} className={`record${menuOpen ? " menu-open" : ""}${renaming ? " renaming" : ""}`}>
                {renaming ? null : (
                  <button
                    type="button"
                    className="record-hit"
                    data-testid={`record-${record.id}`}
                    aria-label={record.scene_title_zh}
                    disabled={openingId === record.id || busyId === record.id}
                    onClick={() => {
                      setMenuId(null);
                      setOpeningId(record.id);
                      onOpen(record.id, Boolean(record.finished_at));
                    }}
                  />
                )}
                <div className="record-row">
                  <div className="record-body">
                    <span className="scene-kicker">
                      {record.partner_name} · {record.level} · {formatWhen(record.created_at)}
                    </span>
                    {renaming ? (
                      <form className="record-rename" onSubmit={(event) => void saveRename(event, record.id)}>
                        <input
                          data-testid={`rename-input-${record.id}`}
                          value={titleDraft}
                          maxLength={40}
                          autoFocus
                          aria-label="这场的名字"
                          onChange={(event) => setTitleDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setRenamingId(null);
                          }}
                        />
                      </form>
                    ) : (
                      <div className="record-open">
                        <strong>{record.scene_title_zh}</strong>
                        <span>{record.preview}</span>
                        <span className="record-meta">
                          {record.ending ? "在写小结…" : record.finished_at ? "已小结" : "进行中"} · {record.user_turns} 句 · {record.correction_count} 处指正
                        </span>
                      </div>
                    )}
                    {renaming ? (
                      <>
                        <span>{record.preview}</span>
                        <span className="record-meta">回车保存，Esc 取消</span>
                      </>
                    ) : null}
                  </div>
                  {record.score ? <RadarScore score={record.score} testId={`score-${record.id}`} /> : <span />}
                  {renaming ? null : (
                    <button
                      type="button"
                      className="record-more"
                      aria-label="重命名或删除"
                      aria-expanded={menuId === record.id}
                      data-testid={`record-menu-${record.id}`}
                      onClick={() => {
                        setConfirmingId(null);
                        setMenuId((current) => (current === record.id ? null : record.id));
                      }}
                    >
                      ⋯
                    </button>
                  )}
                </div>
                {confirmingId === record.id ? (
                  <div className="record-menu" role="dialog" aria-label="删除这场">
                    <p>删掉这场？无法恢复。</p>
                    <button type="button" onClick={() => setConfirmingId(null)} disabled={busyId === record.id}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="danger"
                      data-testid={`confirm-delete-${record.id}`}
                      disabled={busyId === record.id}
                      onClick={() => void remove(record.id)}
                    >
                      {busyId === record.id ? "正在删除…" : "删除"}
                    </button>
                  </div>
                ) : menuId === record.id ? (
                  <div className="record-menu" role="menu">
                    <button type="button" role="menuitem" data-testid={`rename-${record.id}`} onClick={() => beginRename(record)}>
                      重命名
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      data-testid={`delete-${record.id}`}
                      onClick={() => {
                        setMenuId(null);
                        setConfirmingId(record.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
