import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { AppShell, type LibraryPage } from "./AppShell";
import { ConversationScreen } from "./ConversationScreen";
import { HomeScreen } from "./HomeScreen";
import { PhrasesScreen } from "./PhrasesScreen";
import { RecordsScreen } from "./RecordsScreen";
import { ReviewScreen } from "./ReviewScreen";
import { SettingsScreen } from "./SettingsScreen";
import { SetupScreen } from "./SetupScreen";
import type { Session } from "./types";

type ReturnTo = "home" | "records";

type Screen =
  | { name: LibraryPage }
  | { name: "setup" }
  | { name: "talk"; session: Session; back: ReturnTo }
  | { name: "review"; session: Session; back: ReturnTo };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .settings()
      .then((next) => {
        if (alive) setHasKey(next.api_key_set);
      })
      .catch(() => {
        if (alive) setHasKey(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function leaveTo(back: ReturnTo) {
    setScreen(back === "records" ? { name: "records" } : { name: "home" });
  }

  async function openRecord(sessionId: string, finished: boolean) {
    setError(null);
    try {
      const session = await api.session(sessionId);
      const back: ReturnTo = "records";
      setScreen(finished || session.finished_at ? { name: "review", session, back } : { name: "talk", session, back });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场记录没有打开。");
    }
  }

  function openLibrary(page: LibraryPage) {
    setScreen({ name: page });
  }

  if (screen.name === "setup") {
    return (
      <SetupScreen
        onBack={() => setScreen({ name: "home" })}
        onStart={(session) => setScreen({ name: "talk", session, back: "home" })}
      />
    );
  }
  if (screen.name === "talk") {
    return (
      <ConversationScreen
        session={screen.session}
        exitLabel={screen.back === "records" ? "返回记录" : "返回练习"}
        onExit={() => leaveTo(screen.back)}
      />
    );
  }
  if (screen.name === "review") {
    return (
      <ReviewScreen
        session={screen.session}
        backLabel={screen.back === "records" ? "返回记录" : "返回练习"}
        onBack={() => leaveTo(screen.back)}
        canPractice={hasKey === true}
        onPractice={() => setScreen({ name: "setup" })}
      />
    );
  }

  const page = screen.name;

  return (
    <AppShell page={page} needsKey={hasKey === false} onNavigate={openLibrary}>
      {error ? <p className="error home-error">{error}</p> : null}
      {page === "records" ? <RecordsScreen onOpen={(id, finished) => void openRecord(id, finished)} /> : null}
      {page === "phrases" ? <PhrasesScreen /> : null}
      {page === "settings" ? <SettingsScreen onKeyChange={setHasKey} /> : null}
      {page === "home" ? <HomeScreen hasKey={hasKey} onPractice={() => setScreen({ name: "setup" })} /> : null}
    </AppShell>
  );
}
