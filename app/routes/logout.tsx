import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { clearSessionCookie, deleteSession } from "../.server/auth";

export async function action({ request }: Route.ActionArgs) {
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
