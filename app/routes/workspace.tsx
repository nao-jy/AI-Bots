import { AppShell, Avatar, Burger } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  DotsThreeIcon,
  SignOutIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { APP_NAME } from "~/const";
import { SectionIcon, type EntitySection } from "../components/entity-page-view";

const items: { path: string; id: EntitySection; label: string }[] = [
  { path: "/bots", id: "bots", label: "チャットボット" },
  { path: "/adapters", id: "adapters", label: "アダプタ" },
  { path: "/agents", id: "agents", label: "エージェント" },
  { path: "/mcp-servers", id: "mcp", label: "MCPサーバー" },
  { path: "/users", id: "users", label: "ユーザー" },
];

export default function Workspace() {
  const location = useLocation();
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] =
    useDisclosure(false);
  const current = items.find((item) => item.path === location.pathname) ?? items[0];

  return (
    <AppShell
      className="workspace-shell"
      navbar={{
        width: 250,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpened },
      }}
      header={{ height: 62 }}
      padding={0}
      transitionDuration={180}
    >
      <AppShell.Navbar className="workspace-navbar">
        <Link to="/bots" className="brand" onClick={closeMobileNav}>
          <span className="brand-mark">
            <SparkleIcon size={20} weight="fill" aria-hidden="true" />
          </span>
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
              onClick={closeMobileNav}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">
                <SectionIcon section={item.id} size={17} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <Link to="/login" className="logout-link">
          <SignOutIcon size={16} aria-hidden="true" />
          ログアウト
        </Link>
        <div className="profile">
          <Avatar color="violet" radius="xl" size={38}>
            MS
          </Avatar>
          <div className="profile-meta">
            <strong>佐藤 美咲</strong>
            <span>misaki@example.com</span>
          </div>
          <span className="profile-menu">
            <DotsThreeIcon size={20} aria-hidden="true" />
          </span>
        </div>
      </AppShell.Navbar>

      <AppShell.Header className="topbar">
        <div className="topbar-content">
          <Burger
            className="mobile-menu-button"
            opened={mobileNavOpened}
            onClick={toggleMobileNav}
            size="sm"
            aria-label="メニューを開閉"
          />
          <div className="breadcrumbs">
            <span>ワークスペース</span>
            <b>/</b>
            <strong>{current.label}</strong>
          </div>
          <div className="top-actions">
            <Avatar color="violet" radius="xl" size={34}>
              MS
            </Avatar>
          </div>
        </div>
      </AppShell.Header>

      <AppShell.Main className="main-area">
        <div className="page-content">
          <Outlet />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
