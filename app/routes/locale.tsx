import { redirect } from "react-router";
import type { Route } from "./+types/locale";
import { isLocale, LOCALE_COOKIE } from "~/i18n";

export function loader({ request }: Route.LoaderArgs) {
  const requestUrl = new URL(request.url);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (
        refererUrl.origin === requestUrl.origin &&
        refererUrl.pathname !== "/locale"
      ) {
        return redirect(`${refererUrl.pathname}${refererUrl.search}`);
      }
    } catch {
      // Ignore invalid Referer values and fall back to the dashboard.
    }
  }
  return redirect("/");
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const selectedLocale = String(formData.get("locale") ?? "");
  const locale = isLocale(selectedLocale) ? selectedLocale : null;
  const returnTo = String(formData.get("returnTo") ?? "/");
  const destination =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  if (!locale) return redirect(destination);

  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return redirect(destination, {
    headers: {
      "Set-Cookie": `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
    },
  });
}
