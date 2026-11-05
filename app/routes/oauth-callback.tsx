import type { Route } from "./+types/oauth-callback";
import { completeOAuthAuthorization } from "../.server/features/oauth";

export async function loader({ request }: Route.LoaderArgs) {
  return completeOAuthAuthorization(request);
}

export default function OAuthCallback() {
  return null;
}
