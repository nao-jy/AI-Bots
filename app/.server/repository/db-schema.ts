// Kysely table types for the existing PostgreSQL aibot schema.
import type { Generated } from "kysely";

export interface AgentDefinitionTable {
  "createdAt": Generated<string>;
  "id": string;
  "modelId": string;
  "name": string;
  "options": unknown | null;
  "organizationId": string;
  "providerId": string;
  "updatedAt": Date;
}

export interface AgentUsageTable {
  "agentId": string | null;
  "chatbotId": string | null;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "inputDetails": unknown;
  "inputTokens": number;
  "organizationId": string;
  "outputDetails": unknown;
  "outputTokens": number;
  "platform": string;
  "providerId": string | null;
  "threadId": string;
  "toolHistory": unknown;
  "updatedAt": Date;
}

export interface BotExecutionTable {
  "adapterId": string | null;
  "agentId": string | null;
  "chatbotId": string | null;
  "errorCode": string | null;
  "errorSummary": string | null;
  "finishedAt": string | null;
  "id": string;
  "organizationId": string;
  "scheduleId": string | null;
  "source": string;
  "startedAt": Generated<string>;
  "status": Generated<string>;
  "threadId": string | null;
  "usageId": number | null;
}

export interface ChatAdapterTable {
  "authId": string | null;
  "config": unknown | null;
  "createdAt": Generated<string>;
  "id": string;
  "name": string;
  "organizationId": string;
  "platform": string;
  "updatedAt": Date;
}

export interface ChatAdapterPublicIdTable {
  "adapterId": string;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "organizationId": string;
  "publicId": string;
  "slot": string;
  "updatedAt": Date;
}

export interface ChatBotTable {
  "agentId": string | null;
  "createdAt": Generated<string>;
  "dataPersistenceScope": Generated<string>;
  "description": string | null;
  "id": string;
  "instruction": string;
  "isEnabled": Generated<boolean>;
  "lookbackMessages": number;
  "maxAgentSteps": Generated<number>;
  "name": string;
  "onFailedMessage": string;
  "organizationId": string;
  "updatedAt": Date;
}

export interface ChatBotAdapterTable {
  "adapterId": string;
  "chatbotId": string;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "organizationId": string;
  "updatedAt": Date;
}

export interface ChatBotFileSystemTable {
  "chatbotId": string;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "organizationId": string;
  "sandboxId": string;
  "updatedAt": Date;
}

export interface ChatBotMcpServerTable {
  "authId": string | null;
  "chatbotId": string;
  "context": unknown | null;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "mcpServerId": string;
  "oauthClientId": string | null;
  "organizationId": string;
  "updatedAt": Date;
}

export interface ChatBotPublicIdTable {
  "chatbotId": string;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "organizationId": string;
  "publicId": string;
  "slot": string;
  "updatedAt": Date;
}

export interface ChatBotScheduleTable {
  "createdAt": Generated<string>;
  "cronParam": string;
  "id": string;
  "name": string;
  "organizationId": string;
  "prompt": string;
  "timezone": string;
  "updatedAt": Date;
}

export interface ChatBotToolSandboxTable {
  "chatbotId": string;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "organizationId": string;
  "sandboxId": string;
  "updatedAt": Date;
}

export interface ChatTargetTable {
  "chatbotAdapterId": number;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "organizationId": string;
  "scheduleId": string;
  "threadId": string;
  "updatedAt": Date;
}

export interface FileSystemAPITable {
  "context": unknown;
  "createdAt": Generated<string>;
  "endpoint": string;
  "headers": unknown | null;
  "id": string;
  "name": string;
  "organizationId": string;
  "updatedAt": Date;
}

export interface GrantTable {
  "createdAt": Generated<string>;
  "grantedById": string | null;
  "id": Generated<number>;
  "organizationId": string;
  "principalId": string;
  "resourceId": string;
  "role": string;
  "updatedAt": Date;
}

export interface GroupTable {
  "createdAt": Generated<string>;
  "id": string;
  "name": string;
  "organizationId": string;
  "updatedAt": Date;
}

export interface McpServerTable {
  "contextEndpoint": string | null;
  "createdAt": Generated<string>;
  "description": string | null;
  "endpoint": string | null;
  "headers": unknown | null;
  "id": string;
  "name": string;
  "organizationId": string;
  "transport": string;
  "updatedAt": Date;
}

export interface MembershipTable {
  "createdAt": Generated<string>;
  "groupId": string;
  "id": Generated<number>;
  "organizationId": string;
  "updatedAt": Date;
  "userId": string;
}

export interface OAuthAuthenticationTable {
  "accessToken": string;
  "createdAt": Generated<string>;
  "expiresAt": string | null;
  "id": string;
  "name": string;
  "oauthId": string;
  "organizationId": string;
  "refreshToken": string | null;
  "updatedAt": Date;
}

export interface OAuthClientTable {
  "authorizationEndpoint": string;
  "clientId": string;
  "clientSecret": string | null;
  "createdAt": Generated<string>;
  "id": string;
  "name": string;
  "organizationId": string;
  "refreshEndpoint": string | null;
  "revocationEndpoint": string | null;
  "scopes": string[];
  "tokenEndpoint": string;
  "updatedAt": Date;
}

export interface OAuthRevocationQueueTable {
  "accessToken": string;
  "attempts": Generated<number>;
  "authenticationId": string;
  "clientId": string;
  "clientSecret": string | null;
  "createdAt": Generated<string>;
  "id": Generated<string>;
  "nextAttemptAt": Generated<string>;
  "refreshToken": string | null;
  "revocationEndpoint": string | null;
}

export interface OAuthRevocationSnapshotTable {
  "authenticationId": string;
  "clientId": string;
  "clientSecret": string | null;
  "oauthId": string;
  "revocationEndpoint": string | null;
}

export interface OrganizationTable {
  "createdAt": Generated<string>;
  "id": string;
  "maxLoginAttempts": Generated<number>;
  "mfaEnabled": Generated<boolean>;
  "minimumPasswordStrength": Generated<number>;
  "name": string;
  "sessionDurationSeconds": Generated<number>;
  "temporaryFileSystemApiId": string | null;
  "updatedAt": Date;
}

export interface PersistentSandboxInstanceTable {
  "adapterId": string | null;
  "apiId": string;
  "chatbotId": string | null;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "instanceId": string;
  "organizationId": string;
  "sandboxId": string;
  "threadId": string | null;
  "updatedAt": Date;
}

export interface PrincipalBaseTable {
  "id": string;
  "organizationId": string;
}

export interface ProviderTable {
  "args": unknown | null;
  "createdAt": Generated<string>;
  "headers": unknown | null;
  "id": string;
  "name": string;
  "organizationId": string;
  "providerName": string;
  "updatedAt": Date;
}

export interface RateLimitTable {
  "coefficient": unknown;
  "createdAt": Generated<string>;
  "criteria": string;
  "criteriaId": string | null;
  "id": string;
  "limit": string;
  "limitExceededMessage": string;
  "name": string;
  "organizationId": string;
  "perThread": boolean;
  "resetOnCron": string;
  "timezone": string;
  "updatedAt": Date;
}

export interface ResourceBaseTable {
  "id": string;
  "organizationId": string;
}

export interface SandboxTable {
  "allowedDomainList": string[];
  "apiId": string;
  "createdAt": Generated<string>;
  "envs": unknown | null;
  "id": string;
  "initCommands": Generated<string[]>;
  "name": string;
  "organizationId": string;
  "updatedAt": Date;
}

export interface SandboxAPITable {
  "createdAt": Generated<string>;
  "endpoint": string;
  "headers": unknown | null;
  "id": string;
  "name": string;
  "organizationId": string;
  "updatedAt": Date;
}

export interface SessionTable {
  "createdAt": Generated<string>;
  "expiresAt": string;
  "id": Generated<number>;
  "mfaAttempts": Generated<number>;
  "mfaVerified": Generated<boolean>;
  "organizationId": string;
  "tokenHash": string;
  "updatedAt": Date;
  "userId": string;
}

export interface ThreadOAuthConnectionTable {
  "adapterId": string;
  "authenticationId": string;
  "authorId": string;
  "chatbotId": string;
  "createdAt": Generated<string>;
  "id": Generated<number>;
  "oauthClientId": string;
  "organizationId": string;
  "updatedAt": Date;
}

export interface UserTable {
  "createdAt": Generated<string>;
  "email": string;
  "emailVerified": Generated<boolean>;
  "id": string;
  "isAdmin": Generated<boolean>;
  "loginAttempts": Generated<number>;
  "mfaSecret": string | null;
  "name": string;
  "organizationId": string;
  "passwordHash": string;
  "updatedAt": Date;
}

export interface Database {
  "aibot.AgentDefinition": AgentDefinitionTable;
  "aibot.AgentUsage": AgentUsageTable;
  "aibot.BotExecution": BotExecutionTable;
  "aibot.ChatAdapter": ChatAdapterTable;
  "aibot.ChatAdapterPublicId": ChatAdapterPublicIdTable;
  "aibot.ChatBot": ChatBotTable;
  "aibot.ChatBotAdapter": ChatBotAdapterTable;
  "aibot.ChatBotFileSystem": ChatBotFileSystemTable;
  "aibot.ChatBotMcpServer": ChatBotMcpServerTable;
  "aibot.ChatBotPublicId": ChatBotPublicIdTable;
  "aibot.ChatBotSchedule": ChatBotScheduleTable;
  "aibot.ChatBotToolSandbox": ChatBotToolSandboxTable;
  "aibot.ChatTarget": ChatTargetTable;
  "aibot.FileSystemAPI": FileSystemAPITable;
  "aibot.Grant": GrantTable;
  "aibot.Group": GroupTable;
  "aibot.McpServer": McpServerTable;
  "aibot.Membership": MembershipTable;
  "aibot.OAuthAuthentication": OAuthAuthenticationTable;
  "aibot.OAuthClient": OAuthClientTable;
  "aibot.OAuthRevocationQueue": OAuthRevocationQueueTable;
  "aibot.OAuthRevocationSnapshot": OAuthRevocationSnapshotTable;
  "aibot.Organization": OrganizationTable;
  "aibot.PersistentSandboxInstance": PersistentSandboxInstanceTable;
  "aibot.PrincipalBase": PrincipalBaseTable;
  "aibot.Provider": ProviderTable;
  "aibot.RateLimit": RateLimitTable;
  "aibot.ResourceBase": ResourceBaseTable;
  "aibot.Sandbox": SandboxTable;
  "aibot.SandboxAPI": SandboxAPITable;
  "aibot.Session": SessionTable;
  "aibot.ThreadOAuthConnection": ThreadOAuthConnectionTable;
  "aibot.User": UserTable;
}
