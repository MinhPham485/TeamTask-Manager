import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { BoardPage } from "@/pages/BoardPage";
import { ChatPage } from "@/pages/ChatPage";

type WorkspaceTab = "board" | "chat";

function normalizeTab(tabParam: string | null): WorkspaceTab {
  return tabParam === "chat" ? "chat" : "board";
}

export function WorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => normalizeTab(searchParams.get("tab")), [searchParams]);

  const switchTab = (tab: WorkspaceTab) => {
    setSearchParams({ tab });
  };

  return (
    <section className="workspace-page">
      <header className="page-card workspace-tab-bar">
        <h2>Workspace</h2>
        <div className="workspace-tabs" role="tablist" aria-label="Workspace tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            className={activeTab === "chat" ? "workspace-tab active" : "workspace-tab"}
            onClick={() => switchTab("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "board"}
            className={activeTab === "board" ? "workspace-tab active" : "workspace-tab"}
            onClick={() => switchTab("board")}
          >
            Kanban Board
          </button>
        </div>
      </header>

      {activeTab === "chat" ? <ChatPage /> : <BoardPage />}
    </section>
  );
}