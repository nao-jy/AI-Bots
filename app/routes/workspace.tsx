import { Avatar } from "@mantine/core";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import type { EntitySection } from "../components/entity-page-view";
import { APP_NAME } from "~/const";

const items: {
  path: string;
  id: EntitySection;
  label: string;
  icon: string;
}[] = [
  { path: "/bots", id: "bots", label: "チャットボット", icon: "◈" },
  { path: "/adapters", id: "adapters", label: "アダプタ", icon: "⌘" },
  { path: "/agents", id: "agents", label: "エージェント", icon: "✳" },
  { path: "/mcp-servers", id: "mcp", label: "MCPサーバー", icon: "⌬" },
  { path: "/users", id: "users", label: "ユーザー", icon: "♙" },
];

export default function Workspace() {
  const location = useLocation();
  const current =
    items.find((item) => item.path === location.pathname) ?? items[0];

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link to="/bots" className="brand">
          <span className="brand-mark">✳</span>
          <span>
            {APP_NAME}
            <span className="brand-dot">.</span>
            <small>AI WORKSPACE</small>
          </span>
        </Link>
        <div className="nav-label">管理</div>
        <nav className="side-nav" aria-label="エンティティ管理">
          {items.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <Link to="/login" className="logout-link">
          <span>⇥</span> ログアウト
        </Link>
        <div className="profile">
          <Avatar color="violet" radius="xl" size={38}>
            MS
          </Avatar>
          <div className="profile-meta">
            <strong>佐藤 美咲</strong>
            <span>misaki@example.com</span>
          </div>
          <span className="profile-menu">⋯</span>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>ワークスペース</span>
            <b>/</b>
            <strong>{current.label}</strong>
          </div>
          <div className="top-actions">
            <div className="top-divider" />
            <Avatar color="violet" radius="xl" size={34}>
              MS
            </Avatar>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
