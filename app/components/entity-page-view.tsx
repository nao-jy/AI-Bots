import { useCallback, useEffect, useRef, useState } from "react";
import type { EntityOption, EntityRecord } from "../types/entities";
import { EntityPageDialogs } from "./entity-page/dialogs";
import { EntityPageHeader } from "./entity-page/header";
import { SectionIcon } from "./entity-page/section-icon";
import { EntityTable } from "./entity-page/table";
import { ResourceGrantsDialog } from "./entity-page/resource-grants-dialog";
import type {
  EntityDialogMode,
  EntityPageDefinition,
} from "./entity-page/types";
import { tMessage } from "../i18n";

export type { EntityField, EntityPageDefinition, EntitySection } from "./entity-page/types";
export { SectionIcon };

function localizeOptions(options?: string[] | EntityOption[]) {
  if (!options) return undefined;
  if (options.length === 0 || typeof options[0] === "string")
    return (options as string[]).map(tMessage);
  return (options as EntityOption[]).map((option) => ({
    ...option,
    label: tMessage(option.label),
  }));
}
export function EntityPageView({
  page,
  dialogResetKey,
  minimumPasswordStrength,
}: {
  page: EntityPageDefinition;
  dialogResetKey?: number;
  minimumPasswordStrength?: number;
}) {
  const [dialog, setDialog] = useState<EntityDialogMode>(null);
  const [selected, setSelected] = useState<EntityRecord | null>(null);
  const [nextEnabled, setNextEnabled] = useState(false);
  const [grantRecord, setGrantRecord] = useState<EntityRecord | null>(null);
  const previousDialogResetKey = useRef(dialogResetKey);

  useEffect(() => {
    if (
      dialogResetKey === undefined ||
      dialogResetKey === previousDialogResetKey.current
    )
      return;
    previousDialogResetKey.current = dialogResetKey;
    setDialog(null);
    setSelected(null);
    setNextEnabled(false);
  }, [dialogResetKey]);

  const localizedPage: EntityPageDefinition = {
    ...page,
    title: tMessage(page.title),
    description: tMessage(page.description),
    createSubmitLabel: page.createSubmitLabel
      ? tMessage(page.createSubmitLabel)
      : undefined,
    launchLabel: page.launchLabel ? tMessage(page.launchLabel) : undefined,
    deleteWarning: page.deleteWarning ? tMessage(page.deleteWarning) : undefined,
    columns: page.columns.map((column) => ({
      ...column,
      label: tMessage(column.label),
    })),
    fields: page.fields.map((field) => ({
      ...field,
      label: tMessage(field.label),
      placeholder: field.placeholder
        ? tMessage(field.placeholder)
        : undefined,
      dependentLabel: field.dependentLabel
        ? tMessage(field.dependentLabel)
        : undefined,
      timezoneDescription: field.timezoneDescription
        ? tMessage(field.timezoneDescription)
        : undefined,
      help: field.help
        ? {
            ...field.help,
            text: tMessage(field.help.text),
            linkText: field.help.linkText
              ? tMessage(field.help.linkText)
              : undefined,
          }
        : undefined,
      options: localizeOptions(field.options),
      dependentOptions: field.dependentOptions
        ? Object.fromEntries(
            Object.entries(field.dependentOptions).map(([key, options]) => [
              key,
              options.map((option) => ({
                ...option,
                label: tMessage(option.label),
              })),
            ]),
          )
        : undefined,
    })),
    mcpAuthenticationOptions: page.mcpAuthenticationOptions?.map((option) => ({
      ...option,
      label: tMessage(option.label),
    })),
    memberOptions: page.memberOptions?.map((option) => ({
      ...option,
      label: tMessage(option.label),
    })),
    toolSetSchemas: page.toolSetSchemas?.map((toolset) => ({
      ...toolset,
      displayName: tMessage(toolset.displayName),
    })),
  };

  const closeDialog = useCallback(() => {
    setDialog(null);
    setSelected(null);
  }, []);

  function openCreate() {
    setSelected(null);
    setDialog("create");
  }

  function openEdit(record: EntityRecord) {
    setSelected(record);
    setDialog("edit");
  }

  function openDelete(record: EntityRecord) {
    setSelected(record);
    setDialog("delete");
  }

  function openForceLogout(record: EntityRecord) {
    setSelected(record);
    setDialog("force-logout");
  }

  function confirmStatusChange(record: EntityRecord, enabled: boolean) {
    setSelected(record);
    setNextEnabled(enabled);
    setDialog("status-change");
  }

  return (
    <div className="entity-page">
      <EntityPageHeader
        title={localizedPage.title}
        description={localizedPage.description}
        onCreate={openCreate}
      />
      <EntityTable
        page={localizedPage}
        onEdit={openEdit}
        onDelete={openDelete}
        onForceLogout={openForceLogout}
        onStatusChange={confirmStatusChange}
        onManageGrants={setGrantRecord}
      />
      <EntityPageDialogs
        page={localizedPage}
        minimumPasswordStrength={minimumPasswordStrength}
        mode={dialog}
        selected={selected}
        nextEnabled={nextEnabled}
        onClose={closeDialog}
      />
      {page.tableFeatures?.resourceGrants && (
        <ResourceGrantsDialog
          record={grantRecord}
          onClose={() => setGrantRecord(null)}
        />
      )}
    </div>
  );
}
