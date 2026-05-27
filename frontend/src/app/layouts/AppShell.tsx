import { PropsWithChildren, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { authStore } from "@/features/auth/store/authStore";
import { disconnectSocketClient } from "@/features/chat/socket/socketClient";
import { FloatingAiChat } from "@/features/chat/components/FloatingAiChat";

const navItems = [
  { to: "/dashboard", label: "Groups", icon: "groups" },
  { to: "/board", label: "Dashboard", icon: "dashboard" },
  { to: "/chat", label: "Chat", icon: "chat" },
];

const SIDEBAR_COLLAPSED_KEY = "teamtask:sidebar-collapsed";

function NavIcon({ name }: { name: string }) {
  if (name === "groups") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M3.5 19c.45-3.1 2.05-5 4.5-5s4.05 1.9 4.5 5" />
        <path d="M11.5 19c.45-3.1 2.05-5 4.5-5s4.05 1.9 4.5 5" />
      </svg>
    );
  }

  if (name === "chat") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14v9H9l-4 3v-12Z" />
        <path d="M8 10h8" />
        <path d="M8 13h5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h7v6H4V5Z" />
      <path d="M13 5h7v4h-7V5Z" />
      <path d="M13 11h7v8h-7v-8Z" />
      <path d="M4 13h7v6H4v-6Z" />
    </svg>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearSession = authStore((state) => state.clearSession);
  const user = authStore((state) => state.user);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const handleLogout = () => {
    setIsUserMenuOpen(false);
    disconnectSocketClient();
    queryClient.clear();
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className={isSidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="brand" title="TeamTask">
            <span className="brand-mark">TT</span>
            <span className="brand-text">TeamTask</span>
          </p>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className={isSidebarCollapsed ? "toggle-icon flipped" : "toggle-icon"}>
              <path d="M15 6 9 12l6 6" />
            </svg>
          </button>
        </div>
        <nav>
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={isActive ? "nav-link active" : "nav-link"} title={item.label}>
                <span className="nav-link-icon" aria-hidden="true">
                  <NavIcon name={item.icon} />
                </span>
                <span className="nav-link-text">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="content-wrapper">
        <header className="topbar">
          <h1>TeamTask Manager</h1>
          <div className="topbar-actions">
            <div className="user-menu">
              <button
                type="button"
                className="user-menu-trigger"
                onClick={() => setIsUserMenuOpen((current) => !current)}
                aria-label="Open user menu"
                aria-expanded={isUserMenuOpen}
                title={user?.username ?? "Account"}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" />
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                    <path d="M4.5 20c.7-4 3.15-6 7.5-6s6.8 2 7.5 6" />
                  </svg>
                )}
              </button>

              {isUserMenuOpen ? (
                <div className="user-menu-panel">
                  <Link className="user-menu-item" to="/profile" onClick={() => setIsUserMenuOpen(false)}>
                    Profile
                  </Link>
                  <Link className="user-menu-item" to="/profile/password" onClick={() => setIsUserMenuOpen(false)}>
                    Change Password
                  </Link>
                  <button type="button" className="user-menu-item" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
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

      <FloatingAiChat />
    </div>
  );
}
