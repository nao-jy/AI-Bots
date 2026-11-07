import type { Route } from "./+types/oauth-callback";
import { completeOAuthAuthorization } from "../.server/features/oauth";
import { completeThreadOAuth } from "../.server/features/thread-oauth-flow";

export async function loader({ request }: Route.LoaderArgs) {
  return (
    (await completeThreadOAuth(request)) ?? completeOAuthAuthorization(request)
  );
}

export default function OAuthCallback() {
  return null;
}
