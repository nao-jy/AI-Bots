import { t, tMessage } from "~/i18n";
import { useEffect, useRef } from "react";
import { ActionIcon, Alert, Group } from "@mantine/core";
import {
  InfoIcon,
  TerminalWindowIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useFetcher } from "react-router";
import type { PersistentInstance } from "./sandbox-shell";

type DeleteInstanceResponse = {
  ok?: boolean;
  error?: string;
  instanceId?: string;
};

export function SandboxInstanceDetails({
  sandboxId,
  instances,
  onOpenShell,
  onDeleted,
}: {
  sandboxId: number;
  instances: PersistentInstance[];
  onOpenShell: (instanceId: string) => void;
  onDeleted: (instanceId: string) => void;
}) {
  const fetcher = useFetcher<DeleteInstanceResponse>();
  const handledResponse = useRef<DeleteInstanceResponse | null>(null);

  useEffect(() => {
    const response = fetcher.data;
    if (
      fetcher.state !== "idle" ||
      !response ||
      response === handledResponse.current
    ) {
      return;
    }
    handledResponse.current = response;
    if (response.ok && response.instanceId) onDeleted(response.instanceId);
  }, [fetcher.data, fetcher.state, onDeleted]);

  return (
    <div className="entity-details">
      <strong className="entity-details-title">{t("components.entityPage.sandboxInstanceDetails.title")}</strong>
      {instances.length > 0 ? (
        <div className="sandbox-instance-list">
          {instances.map((instance) => (
            <div className="sandbox-instance-card" key={instance.instanceId}>
              <div className="sandbox-instance-info">
                <span>{instance.scopeLabel}</span>
                <code>{instance.instanceId}</code>
              </div>
              <Group gap={5} wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={t("components.entityPage.sandboxInstanceDetails.openShell", { 0: instance.instanceId })}
                  onClick={() => onOpenShell(instance.instanceId)}
                >
                  <TerminalWindowIcon size={16} aria-hidden="true" />
                </ActionIcon>
                <fetcher.Form
                  method="post"
                  action="/sandboxes"
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        t("components.entityPage.sandboxInstanceDetails.confirmDeleteInstance", { 0: instance.instanceId }),
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input
                    type="hidden"
                    name="_intent"
                    value="delete-instance"
                  />
                  <input type="hidden" name="id" value={sandboxId} />
                  <input
                    type="hidden"
                    name="instanceId"
                    value={instance.instanceId}
                  />
                  <ActionIcon
                    type="submit"
                    variant="subtle"
                    color="red"
                    aria-label={t("components.entityPage.sandboxInstanceDetails.deleteInstance", { 0: instance.instanceId })}
                    disabled={fetcher.state !== "idle"}
                  >
                    <TrashIcon size={16} aria-hidden="true" />
                  </ActionIcon>
                </fetcher.Form>
              </Group>
            </div>
          ))}
        </div>
      ) : (
        <span className="table-text">{t("components.entityPage.sandboxInstanceDetails.noInstances")}</span>
      )}
      {fetcher.data?.error && (
        <Alert color="red" role="alert" icon={<InfoIcon />}>
          {tMessage(fetcher.data.error)}
        </Alert>
      )}
    </div>
  );
}
