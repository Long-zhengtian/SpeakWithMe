import { useState } from "react";
import { ApiError, api } from "./api/client";
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
  | { name: "home" }
  | { name: "records" }
  | { name: "phrases" }
  | { name: "settings" }
  | { name: "setup" }
  | { name: "talk"; session: Session; back: ReturnTo }
  | { name: "review"; session: Session; back: ReturnTo };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [error, setError] = useState<string | null>(null);

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
        exitLabel={screen.back === "records" ? "回到记录" : "回到主页"}
        onExit={() => leaveTo(screen.back)}
      />
    );
  }
  if (screen.name === "review") {
    return (
      <ReviewScreen
        session={screen.session}
        backLabel={screen.back === "records" ? "回到记录" : "回到主页"}
        onBack={() => leaveTo(screen.back)}
        onPractice={() => setScreen({ name: "setup" })}
      />
    );
  }
  if (screen.name === "phrases") {
    return <PhrasesScreen onBack={() => setScreen({ name: "home" })} />;
  }
  if (screen.name === "settings") {
    return <SettingsScreen onBack={() => setScreen({ name: "home" })} />;
  }
  if (screen.name === "records") {
    return (
      <>
        {error ? <p className="error home-error">{error}</p> : null}
        <RecordsScreen onBack={() => setScreen({ name: "home" })} onOpen={(id, finished) => void openRecord(id, finished)} />
      </>
    );
  }
  return (
    <>
      {error ? <p className="error home-error">{error}</p> : null}
      <HomeScreen
        onPractice={() => setScreen({ name: "setup" })}
        onRecords={() => setScreen({ name: "records" })}
        onPhrases={() => setScreen({ name: "phrases" })}
        onSettings={() => setScreen({ name: "settings" })}
      />
    </>
  );
}
