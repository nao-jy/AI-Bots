import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("/", "routes/workspace.tsx", [
    index("routes/index.tsx"),
    route("bots", "routes/bots.tsx"),
    route("adapters", "routes/adapters.tsx"),
    route("models", "routes/models.tsx"),
    route("agents", "routes/agents.tsx"),
    route("mcp-servers", "routes/mcp-servers.tsx"),
    route("users", "routes/users.tsx"),
  ]),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
