import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import {
  clearSessionCookie,
  deleteSession,
  getSessionUser,
} from "../.server/auth";
import { logAuditEvent } from "../.server/logger/audit-logger";

export async function action({ request }: Route.ActionArgs) {
  const user = await getSessionUser(request);
  logAuditEvent("auth.logout", "user", user?.id ?? null, user?.id);
  await deleteSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": clearSessionCookie() },
  });
}

export function loader() {
  return redirect("/login");
}

export default function Logout() {
  return null;
}
