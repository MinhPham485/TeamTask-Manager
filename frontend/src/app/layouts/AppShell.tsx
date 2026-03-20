import { PropsWithChildren } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { authStore } from "@/features/auth/store/authStore";
import { disconnectSocketClient } from "@/features/chat/socket/socketClient";

const navItems = [
  { to: "/dashboard", label: "Groups" },
  { to: "/board", label: "Board" },
  { to: "/chat", label: "Chat" },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearSession = authStore((state) => state.clearSession);

  const handleLogout = () => {
    disconnectSocketClient();
    queryClient.clear();
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="brand">TeamTask</p>
        <nav>
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={isActive ? "nav-link active" : "nav-link"}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="content-wrapper">
        <header className="topbar">
          <h1>TeamTask Manager</h1>
          <div className="topbar-actions">
            <span className="topbar-caption">Phase 4 group management ready</span>
            <button className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </section>

      <nav className="mobile-nav">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <Link key={item.to} to={item.to} className={isActive ? "mobile-link active" : "mobile-link"}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
