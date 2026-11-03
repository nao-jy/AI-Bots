import { useCallback, useState } from "react";
import type { EntityRecord } from "../types/entities";
import { EntityPageDialogs } from "./entity-page/dialogs";
import { EntityPageHeader } from "./entity-page/header";
import { SectionIcon } from "./entity-page/section-icon";
import { EntityTable } from "./entity-page/table";
import type {
  EntityDialogMode,
  EntityPageDefinition,
} from "./entity-page/types";

export type { EntityField, EntityPageDefinition, EntitySection } from "./entity-page/types";
export { SectionIcon };

export function EntityPageView({ page }: { page: EntityPageDefinition }) {
  const [dialog, setDialog] = useState<EntityDialogMode>(null);
  const [selected, setSelected] = useState<EntityRecord | null>(null);
  const [nextEnabled, setNextEnabled] = useState(false);

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
        title={page.title}
        description={page.description}
        onCreate={openCreate}
      />
      <EntityTable
        page={page}
        onEdit={openEdit}
        onDelete={openDelete}
        onForceLogout={openForceLogout}
        onStatusChange={confirmStatusChange}
      />
      <EntityPageDialogs
        page={page}
        mode={dialog}
        selected={selected}
        nextEnabled={nextEnabled}
        onClose={closeDialog}
      />
    </div>
  );
}
