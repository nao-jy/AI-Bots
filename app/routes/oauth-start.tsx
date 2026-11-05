import { useTranslation } from "react-i18next";
import { Button, Text, Title } from "@mantine/core";
import { redirect } from "react-router";
import type { Route } from "./+types/oauth-start";
import {
  isValidOAuthLaunchPayload,
  launchOAuthAuthorization,
} from "../.server/features/oauth";
import { t } from "~/i18n";
import { APP_NAME } from "~/const";

export function meta() {
  return [
    { title: t("pages.oauthAuthentications.documentTitle", { 0: APP_NAME }) },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const payload = new URL(request.url).searchParams.get("payload") ?? "";
  if (!isValidOAuthLaunchPayload(payload))
    return redirect("/oauth-authentications?oauth=error");
  return { payload };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  return launchOAuthAuthorization(String(form.get("payload") ?? ""));
}

export default function OAuthStart({ loaderData }: Route.ComponentProps) {
  const { t: translate } = useTranslation();

  return (
    <main className="login-page">
      <div className="login-decoration decor-one" />
      <div className="login-decoration decor-two" />
      <div className="login-decoration decor-three" />
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="login-welcome-mark">
            <img src="/logo.png" alt={APP_NAME} />
          </div>
          <Title order={1}>
            {translate("pages.oauthAuthentications.startTitle")}
          </Title>
          <Text className="login-subtitle">
            {translate("pages.oauthAuthentications.startDescription")}
          </Text>
          <form method="post" action="/oauth/start" className="login-form">
            <input type="hidden" name="payload" value={loaderData.payload} />
            <Button
              type="submit"
              className="primary-button login-submit"
              fullWidth
            >
              {translate("pages.oauthAuthentications.startButton")}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
