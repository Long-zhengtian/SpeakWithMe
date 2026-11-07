import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { formatWhen } from "./lib/time";
import type { PracticeRecord } from "./types";

type RecordsScreenProps = {
  onOpen: (sessionId: string, finished: boolean) => void;
};

export function RecordsScreen({ onOpen }: RecordsScreenProps) {
  const [records, setRecords] = useState<PracticeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .profile()
      .then((profile) => {
        if (alive) setRecords(profile.records);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "练习记录没有加载出来。");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="home">
      <header className="home-top">
        <div>
          <h1>记录</h1>
          <p className="lede">
            {records ? `一共 ${records.length} 场。点开一场可以回顾，没结束的可以接着说。` : "正在整理记录…"}
          </p>
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
          {records.map((record) => (
            <button
              key={record.id}
              type="button"
              className="record"
              data-testid={`record-${record.id}`}
              disabled={openingId === record.id}
              onClick={() => {
                setOpeningId(record.id);
                onOpen(record.id, Boolean(record.finished_at));
              }}
            >
              <span className="scene-kicker">
                {record.partner_name} · {record.level} · {formatWhen(record.created_at)}
              </span>
              <strong>{record.scene_title_zh}</strong>
              <span>{record.preview}</span>
              <span className="record-meta">
                {record.finished_at ? "已小结" : "进行中"} · {record.user_turns} 句 · {record.correction_count} 处指正
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
