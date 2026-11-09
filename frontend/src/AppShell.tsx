import type { ReactNode } from "react";

export type LibraryPage = "home" | "records" | "phrases" | "settings";

const pages: { id: LibraryPage; label: string; hint: string }[] = [
  { id: "home", label: "练习", hint: "从这里开一场" },
  { id: "records", label: "记录", hint: "回顾，或接着说" },
  { id: "phrases", label: "笔记本", hint: "词和句子" },
  { id: "settings", label: "设置", hint: "模型和密钥" },
];

type AppShellProps = {
  page: LibraryPage;
  needsKey: boolean;
  onNavigate: (page: LibraryPage) => void;
  children: ReactNode;
};

export function AppShell({ page, needsKey, onNavigate, children }: AppShellProps) {
  return (
    <div className="shell">
      <nav className="rail-nav" aria-label="页面">
        <p className="brand">Speak With Me</p>
        <div className="nav-list">
          {pages.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav-item"
              aria-current={page === item.id ? "page" : undefined}
              data-testid={item.id === "phrases" ? "open-phrases" : item.id === "settings" ? "open-settings" : `nav-${item.id}`}
              onClick={() => onNavigate(item.id)}
            >
              <strong>
                {item.label}
                {item.id === "settings" && needsKey ? <i className="nav-mark" aria-label="还没接上模型" /> : null}
              </strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
      </nav>
      <div className="shell-main">{children}</div>
    </div>
  );
}
