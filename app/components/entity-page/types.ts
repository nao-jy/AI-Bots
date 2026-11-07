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
    | "metric-coefficients"
    | "select"
    | "dependent-select"
    | "multiselect"
    | "mcp-servers"
    | "tags"
    | "password"
    | "toolset-contexts"
    | "cron"
    | "schedule-targets";
  options?: string[] | EntityOption[];
  dependentOptions?: Record<string, EntityOption[]>;
  dependentKey?: string;
  dependentLabel?: string;
  required?: boolean;
  wide?: boolean;
  createOnly?: boolean;
  valueType?: "string" | "json-scalar";
  timezoneDescription?: string;
  help?: { text: string; linkText?: string; href?: string };
};

export type EntitySection =
  | "dashboard"
  | "bots"
  | "adapters"
  | "agents"
  | "rate_limits"
  | "providers"
  | "mcp"
  | "users"
  | "groups"
  | "oauth_clients"
  | "oauth_authentications"
  | "sandboxes"
  | "schedules"
  | "executions"
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
  adminToggle?: boolean;
  forceLogout?: boolean;
  emailVerification?: boolean;
  mfaReset?: boolean;
  loginUnlock?: boolean;
  resourceGrants?: boolean;
  groupMembers?: boolean;
};

export type EntityPageDefinition = {
  title: string;
  description: string;
  icon: EntitySection;
  protectedRecordId?: string | number;
  columns: EntityColumn[];
  tableFeatures?: EntityTableFeatures;
  fields: EntityField[];
  records: EntityRecord[];
  pagination?: { ids: string[]; query: string; page: number; hasNext: boolean };
  memberOptions?: EntityOption[];
  deleteWarning?: string;
  mcpAuthenticationOptions?: EntityOption[];
  createIntent?: string;
  createSubmitLabel?: string;
  authorizationInNewTab?: boolean;
  launchIntent?: string;
  launchLabel?: string;
  toolSetSchemas?: { name: string; displayName: string; schema: unknown }[];
};
