import { AppShell, Avatar, Burger } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { DotsThreeIcon, SignOutIcon } from "@phosphor-icons/react";
import { Form, Link, NavLink, Outlet, useLocation } from "react-router";
import type { Route } from "./+types/layout";
import { requireUser } from "../.server/auth";
import { APP_NAME } from "~/const";
import { type NavigationLabelKey } from "~/i18n";
import { getLocaleFromCookie } from "~/i18n";
import { LanguageSwitcher } from "~/components/language-switcher";
import { useTranslation } from "react-i18next";
import {
  SectionIcon,
  type EntitySection,
} from "../components/entity-page-view";

const items: {
  path: string;
  id: EntitySection;
  labelKey: NavigationLabelKey;
}[] = [
  { path: "/", id: "dashboard", labelKey: "navigation.dashboard" },
  { path: "/bots", id: "bots", labelKey: "navigation.chatbots" },
  { path: "/adapters", id: "adapters", labelKey: "navigation.adapters" },
  { path: "/providers", id: "providers", labelKey: "navigation.providers" },
  { path: "/agents", id: "agents", labelKey: "navigation.agents" },
  {
    path: "/rate-limits",
    id: "rate_limits",
    labelKey: "navigation.rateLimits",
  },
  { path: "/sandboxes", id: "sandboxes", labelKey: "navigation.sandboxes" },
  { path: "/schedules", id: "schedules", labelKey: "navigation.schedules" },
  { path: "/mcp-servers", id: "mcp", labelKey: "navigation.mcpServers" },
  {
    path: "/oauth-clients",
    id: "oauth_clients",
    labelKey: "navigation.oauthClients",
  },
  {
    path: "/oauth-authentications",
    id: "oauth_authentications",
    labelKey: "navigation.oauthAuthentications",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return {
    user,
    locale: getLocaleFromCookie(request.headers.get("cookie")),
    items: user.isAdmin
      ? [
          ...items,
          {
            path: "/users",
            id: "users" as const,
            labelKey: "navigation.users",
          },
          {
            path: "/groups",
            id: "groups" as const,
            labelKey: "navigation.groups",
          },
          {
            path: "/settings",
            id: "settings" as const,
            labelKey: "navigation.settings",
          },
        ]
      : items,
  };
}

export default function Workspace({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
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
        <Link to="/" className="brand" onClick={closeMobileNav}>
          <span className="brand-mark">
            <img src="/logo.png" alt={APP_NAME} />
          </span>
        </Link>

        <nav className="side-nav" aria-label={t("navigation.entityManagement")}>
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
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <Form method="post" action="/logout" className="logout-form">
          <button type="submit" className="logout-link">
            <SignOutIcon size={16} aria-hidden="true" />
            {t("actions.logout")}
          </button>
        </Form>
        <div className="profile">
          <Avatar color="violet" radius="xl" size={38}>
            {(loaderData.user.name ?? loaderData.user.email)
              .slice(0, 2)
              .toUpperCase()}
          </Avatar>
          <div className="profile-meta">
            <strong>{loaderData.user.name ?? t("navigation.users")}</strong>
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
            aria-label={t("navigation.menuToggle")}
          />
          <div className="breadcrumbs">
            <span>{APP_NAME}</span>
            <b>/</b>
            <strong>{t(current.labelKey)}</strong>
          </div>
          <div className="top-actions">
            <LanguageSwitcher />
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
