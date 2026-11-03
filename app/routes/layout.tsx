import { AppShell, Avatar, Burger } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { DotsThreeIcon, SignOutIcon } from "@phosphor-icons/react";
import { Form, Link, NavLink, Outlet, useLocation } from "react-router";
import type { Route } from "./+types/layout";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import {
  SectionIcon,
  type EntitySection,
} from "../components/entity-page-view";

const items: { path: string; id: EntitySection; label: string }[] = [
  { path: "/bots", id: "bots", label: "チャットボット" },
  { path: "/adapters", id: "adapters", label: "アダプタ" },
  { path: "/providers", id: "providers", label: "プロバイダ" },
  { path: "/agents", id: "agents", label: "エージェント" },
  { path: "/sandboxes", id: "sandboxes", label: "サンドボックス" },
  { path: "/schedules", id: "schedules", label: "スケジュール" },
  { path: "/mcp-servers", id: "mcp", label: "MCPサーバー" },
  { path: "/oauth-clients", id: "oauth_clients", label: "OAuthクライアント" },
  {
    path: "/oauth-authentications",
    id: "oauth_authentications",
    label: "OAuth認証情報",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return {
    user,
    items: user.isAdmin
      ? [
          ...items,
          { path: "/users", id: "users" as const, label: "ユーザー" },
          { path: "/settings", id: "settings" as const, label: "設定" },
        ]
      : items,
  };
}

export default function Workspace({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] =
    useDisclosure(false);
  const current =
    loaderData.items.find((item) => item.path === location.pathname) ??
    loaderData.items[0];

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
            <img src="/logo.png" alt={APP_NAME} />
          </span>
        </Link>

        <div className="nav-label">管理</div>
        <nav className="side-nav" aria-label="エンティティ管理">
          {loaderData.items.map((item) => (
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
        <Form method="post" action="/logout" className="logout-form">
          <button type="submit" className="logout-link">
            <SignOutIcon size={16} aria-hidden="true" />
            ログアウト
          </button>
        </Form>
        <div className="profile">
          <Avatar color="violet" radius="xl" size={38}>
            {(loaderData.user.name ?? loaderData.user.email)
              .slice(0, 2)
              .toUpperCase()}
          </Avatar>
          <div className="profile-meta">
            <strong>{loaderData.user.name ?? "ユーザー"}</strong>
            <span>{loaderData.user.email}</span>
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
            <span>{APP_NAME}</span>
            <b>/</b>
            <strong>{current.label}</strong>
          </div>
          <div className="top-actions">
            <Avatar color="violet" radius="xl" size={34}>
              {(loaderData.user.name ?? loaderData.user.email)
                .slice(0, 2)
                .toUpperCase()}
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
