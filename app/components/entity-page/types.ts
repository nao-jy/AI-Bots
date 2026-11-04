import type { EntityOption, EntityRecord } from "../../types/entities";

export type EntityField = {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "textarea"
    | "key-value"
    | "select"
    | "multiselect"
    | "mcp-servers"
    | "tags"
    | "password"
    | "toolset-contexts"
    | "cron"
    | "schedule-targets";
  options?: string[] | EntityOption[];
  required?: boolean;
  wide?: boolean;
  createOnly?: boolean;
  valueType?: "string" | "json-scalar";
  timezoneDescription?: string;
  help?: { text: string; linkText?: string; href?: string };
};

export type EntitySection =
  | "bots"
  | "adapters"
  | "agents"
  | "rate_limits"
  | "providers"
  | "mcp"
  | "users"
  | "oauth_clients"
  | "oauth_authentications"
  | "sandboxes"
  | "schedules"
  | "settings";

export type EntityColumn = {
  key: string;
  label: string;
  presentation?:
    | "status-toggle"
    | "admin-toggle"
    | "webhook-count"
    | "verification-status"
    | "mfa-status";
};
export type EntityDialogMode =
  "create" | "edit" | "delete" | "status-change" | "force-logout" | null;

export type EntityTableFeatures = {
  subtitleKeys?: string[];
  publicIds?: boolean;
  webhookDetails?: boolean;
  sandboxShell?: boolean;
  expandableActions?: boolean;
  forceLogout?: boolean;
  emailVerification?: boolean;
  mfaReset?: boolean;
  loginUnlock?: boolean;
};

export type EntityPageDefinition = {
  title: string;
  description: string;
  icon: EntitySection;
  protectedRecordId?: number;
  columns: EntityColumn[];
  tableFeatures?: EntityTableFeatures;
  fields: EntityField[];
  records: EntityRecord[];
  mcpAuthenticationOptions?: EntityOption[];
  createIntent?: string;
  createSubmitLabel?: string;
  launchIntent?: string;
  launchLabel?: string;
  toolSetSchemas?: { name: string; displayName: string; schema: unknown }[];
};
