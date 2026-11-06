import { t, tMessage } from "~/i18n";
import { useFetcher } from "react-router";
import {
  ActionIcon,
  CopyButton,
  Tooltip,
} from "@mantine/core";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  CopySimpleIcon,
} from "@phosphor-icons/react";
import type { PublicIdSlot } from "../../types/entities";

export function PublicIdDetails({
  recordId,
  publicIdsValue,
  webhookEndpointsValue,
  showWebhooks,
}: {
  recordId: string | number;
  publicIdsValue: string | number | undefined;
  webhookEndpointsValue: string | number | undefined;
  showWebhooks: boolean;
}) {
  const fetcher = useFetcher();
  const publicIds = parsePublicIds(publicIdsValue);
  const webhookEndpoints = showWebhooks
    ? parseWebhookEndpoints(webhookEndpointsValue)
    : [];

  return (
    <div className="entity-details">
      <strong className="entity-details-title">{t("components.entityPage.publicIdDetails.title")}</strong>
      <div className="public-id-grid">
        {(["first", "second"] as const).map((slot, index) => {
          const publicId = publicIds.find((item) => item.slot === slot)?.id;
          return (
            <div className="public-id-card" key={slot}>
              <div className="public-id-label">{index + 1}{t("components.entityPage.publicIdDetails.ordinalSuffix")}</div>
              <div className="public-id-value">
                <code>{publicId ?? t("components.entityPage.publicIdDetails.notIssued")}</code>
                {publicId && (
                  <CopyButton value={publicId} timeout={1500}>
                    {({ copied, copy }) => (
                      <Tooltip
                        label={copied ? t("components.entityPage.publicIdDetails.copied") : t("components.entityPage.publicIdDetails.copyId")}
                      >
                        <ActionIcon
                          variant="subtle"
                          color={copied ? "teal" : "gray"}
                          aria-label={t("components.entityPage.publicIdDetails.copyPublicIdAriaLabel", { 0: index + 1 })}
                          onClick={copy}
                        >
                          {copied ? (
                            <CheckIcon size={15} />
                          ) : (
                            <CopySimpleIcon size={15} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                )}
              </div>
              <fetcher.Form method="post">
                <input
                  type="hidden"
                  name="_intent"
                  value="regenerate-public-ids"
                />
                <input type="hidden" name="id" value={recordId} />
                <input type="hidden" name="slot" value={slot} />
                <button
                  className="public-id-regenerate"
                  type="submit"
                  disabled={fetcher.state !== "idle"}
                  onClick={(event) => {
                    if (
                      !window.confirm(
                        t("components.entityPage.publicIdDetails.confirmRegeneratePublicId", { 0: index + 1 }),
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <ArrowsClockwiseIcon size={15} aria-hidden="true" />
                  {index + 1}{t("components.entityPage.publicIdDetails.regeneratePublicId")}</button>
              </fetcher.Form>
            </div>
          );
        })}
      </div>
      {fetcher.data?.error && (
        <span className="public-id-error" role="alert">
          {tMessage(fetcher.data.error)}
        </span>
      )}
      {showWebhooks && (
        <div className="webhook-details">
          <strong className="entity-details-title">{t("components.entityPage.publicIdDetails.webhookUrlTitle")}</strong>
          {webhookEndpoints.length > 0 ? (
            <div className="webhook-endpoints">
              {webhookEndpoints.map(({ adapterName, url }) => (
                <div
                  className="webhook-endpoint"
                  key={`${adapterName}-${url}`}
                >
                  <span className="webhook-adapter-name">{adapterName}</span>
                  <code>{url}</code>
                  <CopyButton value={url} timeout={1500}>
                    {({ copied, copy }) => (
                      <Tooltip
                        label={copied ? t("components.entityPage.publicIdDetails.copied") : t("components.entityPage.publicIdDetails.copyUrl")}
                      >
                        <ActionIcon
                          variant="subtle"
                          color={copied ? "teal" : "gray"}
                          aria-label={t("components.entityPage.publicIdDetails.copyWebhookUrlAriaLabel", { 0: adapterName })}
                          onClick={copy}
                        >
                          {copied ? (
                            <CheckIcon size={15} />
                          ) : (
                            <CopySimpleIcon size={15} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </div>
              ))}
            </div>
          ) : (
            <span className="table-text">{t("components.entityPage.publicIdDetails.webhookUrlUnavailable")}</span>
          )}
        </div>
      )}
    </div>
  );
}

function parsePublicIds(value: string | number | undefined) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { slot: PublicIdSlot; id: string } =>
        item &&
        typeof item === "object" &&
        (item.slot === "first" || item.slot === "second") &&
        typeof item.id === "string",
    );
  } catch {
    return [];
  }
}

function parseWebhookEndpoints(value: string | number | undefined) {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { adapterName: string; url: string } =>
        item &&
        typeof item === "object" &&
        typeof item.adapterName === "string" &&
        typeof item.url === "string",
    );
  } catch {
    return [];
  }
}
