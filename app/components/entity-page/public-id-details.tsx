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
  recordId: number;
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
      <strong className="entity-details-title">パブリックID</strong>
      <div className="public-id-grid">
        {(["first", "second"] as const).map((slot, index) => {
          const publicId = publicIds.find((item) => item.slot === slot)?.id;
          return (
            <div className="public-id-card" key={slot}>
              <div className="public-id-label">{index + 1}つ目</div>
              <div className="public-id-value">
                <code>{publicId ?? "未発行"}</code>
                {publicId && (
                  <CopyButton value={publicId} timeout={1500}>
                    {({ copied, copy }) => (
                      <Tooltip
                        label={copied ? "コピーしました" : "IDをコピー"}
                      >
                        <ActionIcon
                          variant="subtle"
                          color={copied ? "teal" : "gray"}
                          aria-label={`${index + 1}つ目のパブリックIDをコピー`}
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
                        `${index + 1}つ目のパブリックIDを再生成すると、このIDを使うWebhook URLは使えなくなります。続けますか？`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <ArrowsClockwiseIcon size={15} aria-hidden="true" />
                  {index + 1}つ目を再生成
                </button>
              </fetcher.Form>
            </div>
          );
        })}
      </div>
      {fetcher.data?.error && (
        <span className="public-id-error" role="alert">
          {fetcher.data.error}
        </span>
      )}
      {showWebhooks && (
        <div className="webhook-details">
          <strong className="entity-details-title">Webhook URL</strong>
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
                        label={copied ? "コピーしました" : "URLをコピー"}
                      >
                        <ActionIcon
                          variant="subtle"
                          color={copied ? "teal" : "gray"}
                          aria-label={`${adapterName} の Webhook URL をコピー`}
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
            <span className="table-text">Webhook URLはありません</span>
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
