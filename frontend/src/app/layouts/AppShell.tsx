import { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  { to: "/dashboard", label: "Groups" },
  { to: "/board", label: "Board" },
  { to: "/chat", label: "Chat" },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();

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
          <span className="topbar-caption">Phase 1-2 frontend architecture ready</span>
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
