import { t, tMessage } from "~/i18n";
import { useEffect, useState } from "react";
import { ActionIcon, Button, Group, Table, Tooltip } from "@mantine/core";
import {
  CaretDownIcon,
  CaretRightIcon,
  EnvelopeSimpleIcon,
  ArrowCounterClockwiseIcon,
  PencilSimpleIcon,
  SignOutIcon,
  ShareNetworkIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useFetcher } from "react-router";
import { notifications } from "@mantine/notifications";
import type { EntityRecord } from "../../types/entities";
import type { EntityPageDefinition } from "./types";
import { EntityCell } from "./entity-cell";
import { PublicIdDetails } from "./public-id-details";
import { SectionIcon } from "./section-icon";
import {
  parsePersistentInstances,
  type PersistentInstance,
} from "./sandbox-shell";
import { SandboxInstanceDetails } from "./sandbox-instance-details";
import { GroupMembersDetails } from "./group-members-details";

export function EntityRow({
  page,
  record,
  onEdit,
  onDelete,
  onForceLogout,
  onStatusChange,
  onManageGrants,
  onOpenShell,
  onDeleteInstance,
}: {
  page: EntityPageDefinition;
  record: EntityRecord;
  onEdit: () => void;
  onDelete: () => void;
  onForceLogout: () => void;
  onStatusChange: (enabled: boolean) => void;
  onManageGrants: () => void;
  onOpenShell: (instanceId: string) => void;
  onDeleteInstance: (instanceId: string) => void;
}) {
  const cannotDelete = record.id === page.protectedRecordId;
  const recordNameValue = record[page.columns[0].key];
  const recordName =
    typeof recordNameValue === "boolean"
      ? String(recordNameValue)
      : recordNameValue;
  const grantRecordName = String(
    record.name ?? record.targetLabel ?? recordName ?? record.id,
  );
  const supportsPublicIds = page.tableFeatures?.publicIds ?? false;
  const supportsSandboxShell = page.tableFeatures?.sandboxShell ?? false;
  const supportsGroupMembers = page.tableFeatures?.groupMembers ?? false;
  const supportsActions = page.tableFeatures?.expandableActions ?? false;
  const hasExpandedContent =
    supportsPublicIds ||
    supportsSandboxShell ||
    supportsActions ||
    supportsGroupMembers;
  const supportsEmailVerification =
    page.tableFeatures?.emailVerification ?? false;
  const supportsLoginUnlock = page.tableFeatures?.loginUnlock ?? false;
  const supportsResourceGrants = page.tableFeatures?.resourceGrants ?? false;
  const canUpdate =
    !supportsResourceGrants || String(record.canUpdate) === "true";
  const canDelete =
    !supportsResourceGrants || String(record.canDelete) === "true";
  const canManageGrants = String(record.canManageGrants) === "true";
  const instances: PersistentInstance[] = parsePersistentInstances(
    String(record.instances ?? "[]"),
  );
  const [expanded, setExpanded] = useState(false);
  const subtitle = page.tableFeatures?.subtitleKeys
    ?.map((key) => record[key])
    .find((value) => value !== undefined && value !== null && value !== "");

  const actions = supportsActions ? (
    <div className="entity-action-list">
      {page.tableFeatures?.adminToggle && (
        <EntityCell
          column={{
            key: "isAdmin",
            label: "pages.users.roleLabel",
            presentation: "admin-toggle",
          }}
          recordName={String(recordName ?? "")}
          value={record.isAdmin}
          onStatusChange={onStatusChange}
          disabled={record.id === page.protectedRecordId}
        />
      )}
      {page.tableFeatures?.forceLogout && (
        <Button
          variant="light"
          color="orange"
          size="xs"
          leftSection={<SignOutIcon size={15} aria-hidden="true" />}
          disabled={cannotDelete || record.loginActive !== true}
          onClick={onForceLogout}
        >
          {t("components.entityPage.entityRow.forceLogout")}
        </Button>
      )}
      {supportsEmailVerification && (
        <EmailVerificationAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
          emailVerified={record.emailVerified === true}
        />
      )}
      {page.tableFeatures?.mfaReset && record.mfaConfigured === true && (
        <MfaResetAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
      {supportsLoginUnlock && record.loginLocked === true && (
        <LoginUnlockAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
    </div>
  ) : (
    <Group gap={5} justify="flex-end">
      {supportsResourceGrants && canManageGrants && (
        <Tooltip label={t("components.resourceGrants.manageAccess")}>
          <ActionIcon
            variant="subtle"
            color="violet"
            aria-label={t("components.resourceGrants.manageAccessFor", {
              0: grantRecordName,
            })}
            onClick={onManageGrants}
          >
            <ShareNetworkIcon size={16} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      )}
      {page.tableFeatures?.forceLogout && (
        <Tooltip
          label={
            cannotDelete
              ? t("components.entityPage.entityRow.cannotForceLogoutSelf")
              : record.loginActive !== true
                ? t("components.entityPage.entityRow.userNotLoggedIn")
                : t("components.entityPage.entityRow.endAllSessions")
          }
        >
          <span style={{ display: "inline-flex" }}>
            <ActionIcon
              variant="subtle"
              color="orange"
              aria-label={t(
                "components.entityPage.entityRow.forceLogoutRecord",
                { 0: recordName },
              )}
              disabled={cannotDelete || record.loginActive !== true}
              onClick={onForceLogout}
            >
              <SignOutIcon size={16} aria-hidden="true" />
            </ActionIcon>
          </span>
        </Tooltip>
      )}
      {supportsEmailVerification && (
        <EmailVerificationAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
          emailVerified={record.emailVerified === true}
        />
      )}
      {page.tableFeatures?.mfaReset && record.mfaConfigured === true && (
        <MfaResetAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
      {supportsLoginUnlock && record.loginLocked === true && (
        <LoginUnlockAction
          recordId={record.id}
          recordName={String(recordName ?? "")}
        />
      )}
      {canUpdate && (
        <Tooltip
          label={t("components.entityPage.entityRow.editRecord", {
            0: recordName,
          })}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t("components.entityPage.entityRow.editRecord", {
              0: recordName,
            })}
            onClick={onEdit}
          >
            <PencilSimpleIcon size={16} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      )}
      {canDelete && (
        <Tooltip
          label={
            cannotDelete
              ? t("components.entityPage.entityRow.cannotDeleteSelf")
              : t("components.entityPage.entityRow.deleteRecord", {
                  0: recordName,
                })
          }
        >
          <span style={{ display: "inline-flex" }}>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={
                cannotDelete
                  ? t("components.entityPage.entityRow.cannotDeleteSelf")
                  : t("components.entityPage.entityRow.deleteRecord", {
                      0: recordName,
                    })
              }
              disabled={cannotDelete}
              onClick={onDelete}
            >
              <TrashIcon size={16} aria-hidden="true" />
            </ActionIcon>
          </span>
        </Tooltip>
      )}
    </Group>
  );

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <div className="entity-name-cell">
            {hasExpandedContent && (
              <Tooltip
                label={
                  supportsActions
                    ? t("components.entityPage.entityRow.toggleRecordAction", {
                        0: recordName,
                        1: expanded
                          ? t("components.entityPage.entityRow.close")
                          : t("components.entityPage.entityRow.show"),
                      })
                    : supportsSandboxShell
                      ? t(
                          "components.entityPage.entityRow.togglePersistentInstance",
                          {
                            0: recordName,
                            1: expanded
                              ? t("components.entityPage.entityRow.close")
                              : t("components.entityPage.entityRow.show"),
                          },
                        )
                      : supportsGroupMembers
                        ? t(
                            "components.entityPage.entityRow.toggleGroupMembers",
                            {
                              0: recordName,
                              1: expanded
                                ? t("components.entityPage.entityRow.close")
                                : t("components.entityPage.entityRow.show"),
                            },
                          )
                        : t("components.entityPage.entityRow.togglePublicId", {
                            0: recordName,
                            1: expanded
                              ? t("components.entityPage.entityRow.close")
                              : t("components.entityPage.entityRow.show"),
                          })
                }
              >
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={
                    supportsActions
                      ? t(
                          "components.entityPage.entityRow.toggleRecordAction",
                          {
                            0: recordName,
                            1: expanded
                              ? t("components.entityPage.entityRow.close")
                              : t("components.entityPage.entityRow.show"),
                          },
                        )
                      : supportsSandboxShell
                        ? t(
                            "components.entityPage.entityRow.togglePersistentInstance",
                            {
                              0: recordName,
                              1: expanded
                                ? t("components.entityPage.entityRow.close")
                                : t("components.entityPage.entityRow.show"),
                            },
                          )
                        : supportsGroupMembers
                          ? t(
                              "components.entityPage.entityRow.toggleGroupMembers",
                              {
                                0: recordName,
                                1: expanded
                                  ? t("components.entityPage.entityRow.close")
                                  : t("components.entityPage.entityRow.show"),
                              },
                            )
                          : t(
                              "components.entityPage.entityRow.togglePublicId",
                              {
                                0: recordName,
                                1: expanded
                                  ? t("components.entityPage.entityRow.close")
                                  : t("components.entityPage.entityRow.show"),
                              },
                            )
                  }
                  aria-expanded={expanded}
                  onClick={() => setExpanded((current) => !current)}
                >
                  {expanded ? (
                    <CaretDownIcon size={16} aria-hidden="true" />
                  ) : (
                    <CaretRightIcon size={16} aria-hidden="true" />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
            <span className={`entity-symbol ${page.icon}`}>
              <SectionIcon section={page.icon} size={17} />
            </span>
            <div>
              <strong>
                {recordName ??
                  t("components.entityPage.entityRow.unnamedRecord")}
              </strong>
              {subtitle != null && <small>{String(subtitle)}</small>}
            </div>
          </div>
        </Table.Td>
        {page.columns.slice(1).map((column) => (
          <Table.Td key={column.key}>
            <EntityCell
              column={column}
              recordName={String(recordName ?? "")}
              value={record[column.key]}
              onStatusChange={onStatusChange}
              canUpdate={canUpdate}
              disabled={
                column.presentation === "admin-toggle" &&
                record.id === page.protectedRecordId
              }
            />
          </Table.Td>
        ))}
        <Table.Td>
          {supportsActions ? (
            <Group gap={5} justify="flex-end">
              {supportsResourceGrants && canManageGrants && (
                <Tooltip label={t("components.resourceGrants.manageAccess")}>
                  <ActionIcon
                    variant="subtle"
                    color="violet"
                    aria-label={t("components.resourceGrants.manageAccessFor", {
                      0: grantRecordName,
                    })}
                    onClick={onManageGrants}
                  >
                    <ShareNetworkIcon size={16} aria-hidden="true" />
                  </ActionIcon>
                </Tooltip>
              )}
              {canUpdate && (
                <Tooltip
                  label={t("components.entityPage.entityRow.editRecord", {
                    0: recordName,
                  })}
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t(
                      "components.entityPage.entityRow.editRecord",
                      { 0: recordName },
                    )}
                    onClick={onEdit}
                  >
                    <PencilSimpleIcon size={16} aria-hidden="true" />
                  </ActionIcon>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip
                  label={
                    cannotDelete
                      ? t("components.entityPage.entityRow.cannotDeleteSelf")
                      : t("components.entityPage.entityRow.deleteRecord", {
                          0: recordName,
                        })
                  }
                >
                  <span style={{ display: "inline-flex" }}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={
                        cannotDelete
                          ? t(
                              "components.entityPage.entityRow.cannotDeleteSelf",
                            )
                          : t("components.entityPage.entityRow.deleteRecord", {
                              0: recordName,
                            })
                      }
                      disabled={cannotDelete}
                      onClick={onDelete}
                    >
                      <TrashIcon size={16} aria-hidden="true" />
                    </ActionIcon>
                  </span>
                </Tooltip>
              )}
            </Group>
          ) : (
            actions
          )}
        </Table.Td>
      </Table.Tr>
      {hasExpandedContent && expanded && (
        <Table.Tr className="entity-details-row">
          <Table.Td colSpan={page.columns.length + 1}>
            <div className="entity-details">
              {supportsPublicIds && (
                <PublicIdDetails
                  recordId={record.id}
                  publicIdsValue={String(record.publicIds ?? "")}
                  webhookEndpointsValue={String(record.webhooks ?? "")}
                  showWebhooks={page.tableFeatures?.webhookDetails ?? false}
                />
              )}
              {supportsSandboxShell && (
                <SandboxInstanceDetails
                  sandboxId={record.id}
                  instances={instances}
                  onOpenShell={onOpenShell}
                  onDeleted={onDeleteInstance}
                />
              )}
              {supportsGroupMembers && (
                <GroupMembersDetails
                  groupId={record.id}
                  groupName={String(record[page.columns[0].key] ?? "")}
                  membersValue={String(record.members ?? "")}
                  memberOptions={page.memberOptions ?? []}
                />
              )}
              {supportsActions && (
                <>
                  <strong className="entity-details-title">
                    {t("components.entityPage.entityRow.actionsLabel")}
                  </strong>
                  {actions}
                </>
              )}
            </div>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

function EmailVerificationAction({
  recordId,
  recordName,
  emailVerified,
}: {
  recordId: string | number;
  recordName: string;
  emailVerified: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    if (fetcher.data?.error) {
      notifications.show({
        title: t("components.entityPage.entityRow.verificationEmailSendFailed"),
        message: tMessage(fetcher.data.error),
        color: "red",
      });
    } else if (fetcher.data?.ok) {
      notifications.show({
        title: t("components.entityPage.entityRow.verificationEmailSent"),
        message: t("components.entityPage.entityRow.verificationEmailSentTo", {
          0: recordName,
        }),
        color: "green",
      });
    }
  }, [fetcher.data, recordName]);

  return (
    <>
      <fetcher.Form method="post" action="/users">
        <input type="hidden" name="_intent" value="send-verification" />
        <input type="hidden" name="id" value={recordId} />
        <Button
          variant="light"
          color="blue"
          size="xs"
          type="submit"
          leftSection={<EnvelopeSimpleIcon size={15} aria-hidden="true" />}
          disabled={emailVerified || fetcher.state !== "idle"}
        >
          {t("components.entityPage.entityRow.resendVerificationEmail")}
        </Button>
      </fetcher.Form>
    </>
  );
}

function MfaResetAction({
  recordId,
  recordName,
}: {
  recordId: string | number;
  recordName: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    if (fetcher.data?.error) {
      notifications.show({
        title: t("components.entityPage.entityRow.mfaResetFailed"),
        message: tMessage(fetcher.data.error),
        color: "red",
      });
    } else if (fetcher.data?.ok) {
      notifications.show({
        title: t("components.entityPage.entityRow.mfaResetSucceeded"),
        message: t("components.entityPage.entityRow.mfaResetForRecord", {
          0: recordName,
        }),
        color: "green",
      });
    }
  }, [fetcher.data, recordName]);

  return (
    <>
      <fetcher.Form
        method="post"
        action="/users"
        onSubmit={(event) => {
          if (
            !window.confirm(
              t("components.entityPage.entityRow.confirmMfaReset", {
                0: recordName,
              }),
            )
          )
            event.preventDefault();
        }}
      >
        <input type="hidden" name="_intent" value="reset-mfa" />
        <input type="hidden" name="id" value={recordId} />
        <Button
          variant="light"
          color="orange"
          size="xs"
          type="submit"
          leftSection={
            <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />
          }
          disabled={fetcher.state !== "idle"}
        >
          {t("components.entityPage.entityRow.resetMfa")}
        </Button>
      </fetcher.Form>
    </>
  );
}

function LoginUnlockAction({
  recordId,
  recordName,
}: {
  recordId: string | number;
  recordName: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    if (fetcher.data?.error) {
      notifications.show({
        title: t("components.entityPage.entityRow.unlockFailed"),
        message: tMessage(fetcher.data.error),
        color: "red",
      });
    } else if (fetcher.data?.ok) {
      notifications.show({
        title: t("components.entityPage.entityRow.unlockSucceeded"),
        message: t("components.entityPage.entityRow.userCanLogin", {
          0: recordName,
        }),
        color: "green",
      });
    }
  }, [fetcher.data, recordName]);

  return (
    <>
      <fetcher.Form method="post" action="/users">
        <input type="hidden" name="_intent" value="unlock-login" />
        <input type="hidden" name="id" value={recordId} />
        <Button
          variant="light"
          color="blue"
          size="xs"
          type="submit"
          leftSection={
            <ArrowCounterClockwiseIcon size={15} aria-hidden="true" />
          }
          disabled={fetcher.state !== "idle"}
        >
          {t("components.entityPage.entityRow.unlockLogin")}
        </Button>
      </fetcher.Form>
    </>
  );
}
