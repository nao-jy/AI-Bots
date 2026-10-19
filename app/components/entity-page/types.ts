import type { EntityOption, EntityRecord } from "../../types/entities";

export type EntityField = {
  key: string;
  label: string;
  placeholder?: string;
  type?:
    | "text"
    | "email"
    | "textarea"
    | "select"
    | "multiselect"
    | "password";
  options?: string[] | EntityOption[];
  required?: boolean;
  wide?: boolean;
};

export type EntitySection = "bots" | "adapters" | "agents" | "models" | "mcp" | "users";

export type EntityColumn = { key: string; label: string };
export type EntityDialogMode = "create" | "edit" | "delete" | "status-change" | null;

export type EntityPageDefinition = {
  title: string;
  description: string;
  icon: EntitySection;
  protectedRecordId?: number;
  columns: EntityColumn[];
  fields: EntityField[];
  records: EntityRecord[];
};
