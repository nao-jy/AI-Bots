import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { OAUTH_CALLBACK_PATH } from "./const";

export default [
  route("/", "routes/layout.tsx", [
    index("routes/index.tsx"),
    route("bots", "routes/bots.tsx"),
    route("adapters", "routes/adapters.tsx"),
    route("providers", "routes/providers.tsx"),
    route("oauth-clients", "routes/oauth-clients.tsx"),
    route("oauth-authentications", "routes/oauth-authentications.tsx"),
    route(OAUTH_CALLBACK_PATH, "routes/oauth-callback.tsx"),
    route("agents", "routes/agents.tsx"),
    route("mcp-servers", "routes/mcp-servers.tsx"),
    route("sandboxes", "routes/sandboxes.tsx"),
    route("schedules", "routes/schedules.tsx"),
    route("users", "routes/users.tsx"),
  ]),
  route("login", "routes/login.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("logout", "routes/logout.tsx"),
  route("api/webhooks/:botId/:adapterId", "routes/webhook.tsx"),
  route("api/sandbox-terminals/:terminalId", "routes/sandbox-terminal.tsx"),
] satisfies RouteConfig;
