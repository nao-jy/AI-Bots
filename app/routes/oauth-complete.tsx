import { Alert, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import type { Route } from "./+types/oauth-complete";
import { t } from "~/i18n";
import { APP_NAME } from "~/const";

type CompletionStatus = "success" | "denied" | "error";

export function meta() {
  return [
    {
      title: t("pages.oauthAuthentications.completionDocumentTitle", {
        0: APP_NAME,
      }),
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const status = new URL(request.url).searchParams.get("status");
  const validStatuses: CompletionStatus[] = ["success", "denied", "error"];
  return {
    status: validStatuses.find((candidate) => candidate === status) ?? "error",
  };
}

export default function OAuthComplete({ loaderData }: Route.ComponentProps) {
  const { t: translate } = useTranslation();
  useEffect(() => {
    window.opener?.postMessage(
      { type: "oauth:complete" },
      window.location.origin,
    );
  }, []);

  const messages = {
    success: {
      title: translate("pages.oauthAuthentications.completionTitle"),
      message: translate("pages.oauthAuthentications.completionSucceeded"),
      color: "green",
    },
    denied: {
      title: translate("pages.oauthAuthentications.completionTitle"),
      message: translate("pages.oauthAuthentications.completionCanceled"),
      color: "yellow",
    },
    error: {
      title: translate("pages.oauthAuthentications.completionTitle"),
      message: translate("pages.oauthAuthentications.completionFailed"),
      color: "red",
    },
  }[loaderData.status];

  return (
    <main className="login-page">
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="eyebrow">{APP_NAME}</div>
          <Title order={1}>{messages.title}</Title>
          <Alert color={messages.color} role="status" mt="md">
            {messages.message}
          </Alert>
          <Text c="dimmed" size="sm" ta="center" mt="md">
            {translate("pages.oauthAuthentications.completionCloseTab")}
          </Text>
        </section>
      </div>
    </main>
  );
}
