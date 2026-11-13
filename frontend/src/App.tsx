import { useEffect, useState } from "react";
import { ApiError, api } from "./api/client";
import { stopSpeaking } from "./lib/speak";
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

function showScreen(next: Screen, mode: "push" | "replace") {
  const state = { speak: next };
  if (mode === "push") history.pushState(state, "");
  else history.replaceState(state, "");
}

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

  useEffect(() => {
    history.replaceState({ speak: { name: "home" } satisfies Screen }, "");
    function onPop(event: PopStateEvent) {
      stopSpeaking();
      const next = (event.state as { speak?: Screen } | null)?.speak;
      if (next?.name) setScreen(next);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function goBack() {
    stopSpeaking();
    const state = history.state as { overlay?: string; speak?: Screen } | null;
    if (state?.overlay || (state?.speak && state.speak.name !== "home")) {
      history.back();
      return;
    }
    setScreen({ name: "home" });
  }

  function show(next: Screen, mode: "push" | "replace") {
    stopSpeaking();
    setScreen(next);
    showScreen(next, mode);
  }

  async function openRecord(sessionId: string, finished: boolean, back: ReturnTo = "records") {
    setError(null);
    try {
      const session = await api.session(sessionId);
      show(finished || session.finished_at ? { name: "review", session, back } : { name: "talk", session, back }, "push");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "这场记录没有打开。");
    }
  }

  function openLibrary(page: LibraryPage) {
    if (screen.name === page) return;
    show({ name: page }, "push");
  }

  if (screen.name === "setup") {
    return (
      <AppShell page="home" needsKey={hasKey === false} onNavigate={openLibrary}>
        <SetupScreen
          onBack={goBack}
          onStart={(session) => show({ name: "talk", session, back: "home" }, "replace")}
        />
      </AppShell>
    );
  }
  if (screen.name === "talk") {
    return (
      <ConversationScreen
        session={screen.session}
        exitLabel={screen.back === "records" ? "返回记录" : "返回练习"}
        onExit={goBack}
      />
    );
  }
  if (screen.name === "review") {
    return (
      <ReviewScreen
        session={screen.session}
        backLabel={screen.back === "records" ? "返回记录" : "返回练习"}
        onBack={goBack}
        canPractice={hasKey === true}
        onPractice={() => show({ name: "setup" }, "push")}
        onStarted={(session) => show({ name: "talk", session, back: "records" }, "replace")}
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
      {page === "home" ? (
        <HomeScreen
          hasKey={hasKey}
          onPractice={() => show({ name: "setup" }, "push")}
          onResume={(id) => void openRecord(id, false, "home")}
          onStart={(session) => show({ name: "talk", session, back: "home" }, "push")}
        />
      ) : null}
    </AppShell>
  );
}
