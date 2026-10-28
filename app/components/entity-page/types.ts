import type { EntityOption, EntityRecord } from "../../types/entities";

export type EntityField = {
  key: string;
  label: string;
  placeholder?: string;
  type?:
    | "text"
    | "email"
    | "textarea"
    | "key-value"
    | "select"
    | "multiselect"
    | "password";
  options?: string[] | EntityOption[];
  required?: boolean;
  wide?: boolean;
  createOnly?: boolean;
  valueType?: "string" | "json-scalar";
  help?: { text: string; linkText: string; href: string };
};

export type EntitySection =
  "bots" | "adapters" | "agents" | "providers" | "mcp" | "users" | "oauth" | "sandboxes";

export type EntityColumn = { key: string; label: string };
export type EntityDialogMode =
  "create" | "edit" | "delete" | "status-change" | null;

export type EntityPageDefinition = {
  title: string;
  description: string;
  icon: EntitySection;
  protectedRecordId?: number;
  columns: EntityColumn[];
  fields: EntityField[];
  records: EntityRecord[];
  createIntent?: string;
  createSubmitLabel?: string;
  launchIntent?: string;
  launchLabel?: string;
};
