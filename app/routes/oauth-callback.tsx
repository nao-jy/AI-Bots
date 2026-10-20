import type { Route } from "./+types/oauth-callback";
import { requireUser } from "../.server/auth";
import { completeOAuthAuthorization } from "../.server/features/oauth";

export async function loader({ request }: Route.LoaderArgs) {
  return completeOAuthAuthorization(request, await requireUser(request));
}

export default function OAuthCallback() {
  return null;
}
