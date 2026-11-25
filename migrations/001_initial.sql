CREATE SCHEMA IF NOT EXISTS aibot;

CREATE TABLE aibot."AgentDefinition" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" uuid NOT NULL,
  "modelId" text NOT NULL,
  "name" text NOT NULL,
  "options" jsonb,
  "organizationId" uuid NOT NULL,
  "providerId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name")
);

CREATE TABLE aibot."AgentUsage" (
  "agentId" uuid,
  "chatbotId" uuid,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "inputDetails" jsonb NOT NULL,
  "inputTokens" integer NOT NULL,
  "organizationId" uuid NOT NULL,
  "outputDetails" jsonb NOT NULL,
  "outputTokens" integer NOT NULL,
  "platform" text NOT NULL,
  "providerId" uuid,
  "threadId" text NOT NULL,
  "toolHistory" jsonb NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "AgentUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."BotExecution" (
  "adapterId" uuid,
  "agentId" uuid,
  "chatbotId" uuid,
  "errorCode" text,
  "errorSummary" text,
  "finishedAt" timestamptz,
  "id" uuid NOT NULL,
  "organizationId" uuid NOT NULL,
  "scheduleId" uuid,
  "source" text NOT NULL,
  "startedAt" timestamptz DEFAULT now() NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "threadId" text,
  "usageId" integer,
  CONSTRAINT "BotExecution_pkey" PRIMARY KEY ("id"),
  UNIQUE ("usageId"),
  CONSTRAINT "BotExecution_source_check_aa0623b9" CHECK ("source" IN ('direct_message', 'mention', 'schedule')),
  CONSTRAINT "BotExecution_status_check_c167c90b" CHECK ("status" IN ('running', 'succeeded', 'failed', 'skipped'))
);

CREATE TABLE aibot."ChatAdapter" (
  "authId" uuid,
  "config" jsonb,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "platform" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatAdapter_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name")
);

CREATE TABLE aibot."ChatAdapterPublicId" (
  "adapterId" uuid NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "publicId" text NOT NULL,
  "slot" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatAdapterPublicId_pkey" PRIMARY KEY ("id"),
  UNIQUE ("publicId"),
  UNIQUE ("adapterId", "slot"),
  CONSTRAINT "ChatAdapterPublicId_slot_check_6553fb12" CHECK ("slot" IN ('first', 'second'))
);

CREATE TABLE aibot."ChatBot" (
  "agentId" uuid,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "dataPersistenceScope" text DEFAULT 'nopersistence' NOT NULL,
  "description" text,
  "id" uuid NOT NULL,
  "instruction" text NOT NULL,
  "isEnabled" boolean DEFAULT TRUE NOT NULL,
  "lookbackMessages" integer NOT NULL,
  "maxAgentSteps" integer DEFAULT 8 NOT NULL,
  "name" text NOT NULL,
  "onFailedMessage" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatBot_pkey" PRIMARY KEY ("id"),
  UNIQUE ("agentId"),
  UNIQUE ("organizationId", "name"),
  CONSTRAINT "ChatBot_dataPersistenceScope_check_9e451ce9" CHECK ("dataPersistenceScope" IN ('nopersistence', 'thread', 'bot'))
);

CREATE TABLE aibot."ChatBotAdapter" (
  "adapterId" uuid NOT NULL,
  "chatbotId" uuid NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatBotAdapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."ChatBotFileSystem" (
  "chatbotId" uuid NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "sandboxId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatBotFileSystem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."ChatBotMcpServer" (
  "authId" uuid,
  "chatbotId" uuid NOT NULL,
  "context" jsonb,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "mcpServerId" uuid NOT NULL,
  "oauthClientId" uuid,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatBotMcpServer_pkey" PRIMARY KEY ("id"),
  UNIQUE ("chatbotId", "mcpServerId", "authId"),
  UNIQUE ("chatbotId", "mcpServerId", "oauthClientId")
);

CREATE TABLE aibot."ChatBotPublicId" (
  "chatbotId" uuid NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "publicId" text NOT NULL,
  "slot" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatBotPublicId_pkey" PRIMARY KEY ("id"),
  UNIQUE ("publicId"),
  UNIQUE ("chatbotId", "slot"),
  CONSTRAINT "ChatBotPublicId_slot_check_6553fb12" CHECK ("slot" IN ('first', 'second'))
);

CREATE TABLE aibot."ChatBotSchedule" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "cronParam" text NOT NULL,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "prompt" text NOT NULL,
  "timezone" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatBotSchedule_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name")
);

CREATE TABLE aibot."ChatBotToolSandbox" (
  "chatbotId" uuid NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "sandboxId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatBotToolSandbox_pkey" PRIMARY KEY ("id"),
  UNIQUE ("sandboxId", "chatbotId")
);

CREATE TABLE aibot."ChatTarget" (
  "chatbotAdapterId" integer NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "scheduleId" uuid NOT NULL,
  "threadId" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ChatTarget_pkey" PRIMARY KEY ("id"),
  UNIQUE ("chatbotAdapterId", "threadId", "scheduleId")
);

CREATE TABLE aibot."FileSystemAPI" (
  "context" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "endpoint" text NOT NULL,
  "headers" jsonb,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "FileSystemAPI_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name"),
  UNIQUE ("endpoint", "context", "headers")
);

CREATE TABLE aibot."Grant" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "grantedById" uuid,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "principalId" uuid NOT NULL,
  "resourceId" uuid NOT NULL,
  "role" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "Grant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Grant_role_check_4a2d79b9" CHECK ("role" IN ('viewer', 'editor', 'manager'))
);

CREATE TABLE aibot."Group" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name")
);

CREATE TABLE aibot."McpServer" (
  "contextEndpoint" text,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "description" text,
  "endpoint" text,
  "headers" jsonb,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "transport" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name"),
  CONSTRAINT "McpServer_transport_check_e5d5166c" CHECK ("transport" IN ('http'))
);

CREATE TABLE aibot."Membership" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "groupId" uuid NOT NULL,
  "id" SERIAL NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "userId" uuid NOT NULL,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."OAuthAuthentication" (
  "accessToken" text NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "expiresAt" timestamptz,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "oauthId" uuid NOT NULL,
  "organizationId" uuid NOT NULL,
  "refreshToken" text,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "OAuthAuthentication_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name")
);

CREATE TABLE aibot."OAuthClient" (
  "authorizationEndpoint" text NOT NULL,
  "clientId" text NOT NULL,
  "clientSecret" text,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "refreshEndpoint" text,
  "revocationEndpoint" text,
  "scopes" text[] NOT NULL,
  "tokenEndpoint" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name"),
  CONSTRAINT "OAuthClient_scopes_elem_not_null_de6fcc8e" CHECK (array_position("scopes", NULL) IS NULL)
);

CREATE TABLE aibot."OAuthRevocationQueue" (
  "accessToken" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "authenticationId" uuid NOT NULL,
  "clientId" text NOT NULL,
  "clientSecret" text,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "nextAttemptAt" timestamptz DEFAULT now() NOT NULL,
  "refreshToken" text,
  "revocationEndpoint" text,
  CONSTRAINT "OAuthRevocationQueue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."OAuthRevocationSnapshot" (
  "authenticationId" uuid NOT NULL,
  "clientId" text NOT NULL,
  "clientSecret" text,
  "oauthId" uuid NOT NULL,
  "revocationEndpoint" text,
  CONSTRAINT "OAuthRevocationSnapshot_pkey" PRIMARY KEY ("authenticationId")
);

CREATE TABLE aibot."Organization" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" uuid NOT NULL,
  "maxLoginAttempts" integer DEFAULT 5 NOT NULL,
  "mfaEnabled" boolean DEFAULT FALSE NOT NULL,
  "minimumPasswordStrength" integer DEFAULT 2 NOT NULL,
  "name" text NOT NULL,
  "sessionDurationSeconds" integer DEFAULT 2592000 NOT NULL,
  "temporaryFileSystemApiId" uuid,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."PersistentSandboxInstance" (
  "adapterId" uuid,
  "apiId" uuid NOT NULL,
  "chatbotId" uuid,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "instanceId" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "sandboxId" uuid NOT NULL,
  "threadId" text,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "PersistentSandboxInstance_pkey" PRIMARY KEY ("id"),
  UNIQUE ("apiId", "instanceId")
);

CREATE TABLE aibot."PrincipalBase" (
  "id" uuid NOT NULL,
  "organizationId" uuid NOT NULL,
  CONSTRAINT "PrincipalBase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."Provider" (
  "args" jsonb,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "headers" jsonb,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "providerName" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name")
);

CREATE TABLE aibot."RateLimit" (
  "coefficient" jsonb NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "criteria" text NOT NULL,
  "criteriaId" uuid,
  "id" uuid NOT NULL,
  "limit" numeric NOT NULL,
  "limitExceededMessage" text NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "perThread" boolean NOT NULL,
  "resetOnCron" text NOT NULL,
  "timezone" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name"),
  UNIQUE ("criteria", "criteriaId", "resetOnCron"),
  CONSTRAINT "RateLimit_criteria_check_e0dc3624" CHECK ("criteria" IN ('bot', 'agent', 'provider'))
);

CREATE TABLE aibot."ResourceBase" (
  "id" uuid NOT NULL,
  "organizationId" uuid NOT NULL,
  CONSTRAINT "ResourceBase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE aibot."Sandbox" (
  "allowedDomainList" text[] NOT NULL,
  "apiId" uuid NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "envs" jsonb,
  "id" uuid NOT NULL,
  "initCommands" text[] DEFAULT '{}' NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "Sandbox_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name"),
  CONSTRAINT "Sandbox_allowedDomainList_elem_not_null_2211a85f" CHECK (array_position("allowedDomainList", NULL) IS NULL),
  CONSTRAINT "Sandbox_initCommands_elem_not_null_c09761bc" CHECK (array_position("initCommands", NULL) IS NULL)
);

CREATE TABLE aibot."SandboxAPI" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "endpoint" text NOT NULL,
  "headers" jsonb,
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "SandboxAPI_pkey" PRIMARY KEY ("id"),
  UNIQUE ("organizationId", "name"),
  UNIQUE ("endpoint", "headers")
);

CREATE TABLE aibot."Session" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "id" SERIAL NOT NULL,
  "mfaAttempts" integer DEFAULT 0 NOT NULL,
  "mfaVerified" boolean DEFAULT TRUE NOT NULL,
  "organizationId" uuid NOT NULL,
  "tokenHash" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  "userId" uuid NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  UNIQUE ("tokenHash")
);

CREATE TABLE aibot."ThreadOAuthConnection" (
  "adapterId" uuid NOT NULL,
  "authenticationId" uuid NOT NULL,
  "authorId" text NOT NULL,
  "chatbotId" uuid NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "id" SERIAL NOT NULL,
  "oauthClientId" uuid NOT NULL,
  "organizationId" uuid NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "ThreadOAuthConnection_pkey" PRIMARY KEY ("id"),
  UNIQUE ("authenticationId"),
  UNIQUE ("oauthClientId", "chatbotId", "adapterId", "authorId")
);

CREATE TABLE aibot."User" (
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "email" text NOT NULL,
  "emailVerified" boolean DEFAULT FALSE NOT NULL,
  "id" uuid NOT NULL,
  "isAdmin" boolean DEFAULT FALSE NOT NULL,
  "loginAttempts" integer DEFAULT 0 NOT NULL,
  "mfaSecret" text,
  "name" text NOT NULL,
  "organizationId" uuid NOT NULL,
  "passwordHash" text NOT NULL,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  UNIQUE ("email"),
  UNIQUE ("mfaSecret"),
  UNIQUE ("organizationId", "name")
);

ALTER TABLE aibot."AgentDefinition" ADD CONSTRAINT "AgentDefinition_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."AgentDefinition" ADD CONSTRAINT "AgentDefinition_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."AgentDefinition" ADD CONSTRAINT "AgentDefinition_providerId_idx_d1904c54" FOREIGN KEY ("providerId") REFERENCES "aibot"."Provider" ("id") ON DELETE CASCADE;
CREATE INDEX "AgentDefinition_organizationId_idx_2e17ef41" ON aibot."AgentDefinition" ("organizationId");
CREATE INDEX "AgentDefinition_providerId_idx_d1904c54" ON aibot."AgentDefinition" ("providerId");
ALTER TABLE aibot."AgentUsage" ADD CONSTRAINT "AgentUsage_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."AgentUsage" ADD CONSTRAINT "AgentUsage_agentId_idx_8d0ba4f0" FOREIGN KEY ("agentId") REFERENCES "aibot"."AgentDefinition" ("id") ON DELETE SET NULL;
ALTER TABLE aibot."AgentUsage" ADD CONSTRAINT "AgentUsage_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE SET NULL;
ALTER TABLE aibot."AgentUsage" ADD CONSTRAINT "AgentUsage_providerId_idx_d1904c54" FOREIGN KEY ("providerId") REFERENCES "aibot"."Provider" ("id") ON DELETE SET NULL;
CREATE INDEX "AgentUsage_agentId_idx_8d0ba4f0" ON aibot."AgentUsage" ("agentId");
CREATE INDEX "AgentUsage_chatbotId_idx_52db07ea" ON aibot."AgentUsage" ("chatbotId");
CREATE INDEX "AgentUsage_organizationId_idx_2e17ef41" ON aibot."AgentUsage" ("organizationId");
CREATE INDEX "AgentUsage_providerId_idx_d1904c54" ON aibot."AgentUsage" ("providerId");
ALTER TABLE aibot."BotExecution" ADD CONSTRAINT "BotExecution_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."BotExecution" ADD CONSTRAINT "BotExecution_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE SET NULL;
ALTER TABLE aibot."BotExecution" ADD CONSTRAINT "BotExecution_agentId_idx_8d0ba4f0" FOREIGN KEY ("agentId") REFERENCES "aibot"."AgentDefinition" ("id") ON DELETE SET NULL;
ALTER TABLE aibot."BotExecution" ADD CONSTRAINT "BotExecution_adapterId_idx_f5208af9" FOREIGN KEY ("adapterId") REFERENCES "aibot"."ChatAdapter" ("id") ON DELETE SET NULL;
ALTER TABLE aibot."BotExecution" ADD CONSTRAINT "BotExecution_scheduleId_idx_5a3bfbcb" FOREIGN KEY ("scheduleId") REFERENCES "aibot"."ChatBotSchedule" ("id") ON DELETE SET NULL;
ALTER TABLE aibot."BotExecution" ADD CONSTRAINT "BotExecution_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "aibot"."AgentUsage" ("id") ON DELETE SET NULL;
CREATE INDEX "BotExecution_adapterId_idx_f5208af9" ON aibot."BotExecution" ("adapterId");
CREATE INDEX "BotExecution_agentId_idx_8d0ba4f0" ON aibot."BotExecution" ("agentId");
CREATE INDEX "BotExecution_chatbotId_idx_52db07ea" ON aibot."BotExecution" ("chatbotId");
CREATE INDEX "BotExecution_chatbotId_startedAt_idx_bc9dd7b3" ON aibot."BotExecution" ("chatbotId", "startedAt");
CREATE INDEX "BotExecution_organizationId_idx_2e17ef41" ON aibot."BotExecution" ("organizationId");
CREATE INDEX "BotExecution_organizationId_startedAt_idx_07fce746" ON aibot."BotExecution" ("organizationId", "startedAt");
CREATE INDEX "BotExecution_organizationId_status_startedAt_idx_89d92f5a" ON aibot."BotExecution" ("organizationId", "status", "startedAt");
CREATE INDEX "BotExecution_scheduleId_idx_5a3bfbcb" ON aibot."BotExecution" ("scheduleId");
CREATE INDEX "BotExecution_scheduleId_startedAt_idx_4557286f" ON aibot."BotExecution" ("scheduleId", "startedAt");
ALTER TABLE aibot."ChatAdapter" ADD CONSTRAINT "ChatAdapter_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatAdapter" ADD CONSTRAINT "ChatAdapter_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatAdapter" ADD CONSTRAINT "ChatAdapter_authId_idx_29b6b568" FOREIGN KEY ("authId") REFERENCES "aibot"."OAuthAuthentication" ("id") ON DELETE SET NULL;
CREATE INDEX "ChatAdapter_authId_idx_29b6b568" ON aibot."ChatAdapter" ("authId");
CREATE INDEX "ChatAdapter_organizationId_idx_2e17ef41" ON aibot."ChatAdapter" ("organizationId");
CREATE INDEX "ChatAdapter_platform_idx_b8f7b2d3" ON aibot."ChatAdapter" ("platform");
ALTER TABLE aibot."ChatAdapterPublicId" ADD CONSTRAINT "ChatAdapterPublicId_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatAdapterPublicId" ADD CONSTRAINT "ChatAdapterPublicId_adapterId_idx_f5208af9" FOREIGN KEY ("adapterId") REFERENCES "aibot"."ChatAdapter" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatAdapterPublicId_adapterId_idx_f5208af9" ON aibot."ChatAdapterPublicId" ("adapterId");
CREATE INDEX "ChatAdapterPublicId_organizationId_idx_2e17ef41" ON aibot."ChatAdapterPublicId" ("organizationId");
ALTER TABLE aibot."ChatBot" ADD CONSTRAINT "ChatBot_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBot" ADD CONSTRAINT "ChatBot_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBot" ADD CONSTRAINT "ChatBot_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "aibot"."AgentDefinition" ("id") ON DELETE SET NULL;
CREATE INDEX "ChatBot_organizationId_idx_2e17ef41" ON aibot."ChatBot" ("organizationId");
ALTER TABLE aibot."ChatBotAdapter" ADD CONSTRAINT "ChatBotAdapter_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotAdapter" ADD CONSTRAINT "ChatBotAdapter_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotAdapter" ADD CONSTRAINT "ChatBotAdapter_adapterId_idx_f5208af9" FOREIGN KEY ("adapterId") REFERENCES "aibot"."ChatAdapter" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatBotAdapter_adapterId_idx_f5208af9" ON aibot."ChatBotAdapter" ("adapterId");
CREATE INDEX "ChatBotAdapter_chatbotId_idx_52db07ea" ON aibot."ChatBotAdapter" ("chatbotId");
CREATE INDEX "ChatBotAdapter_organizationId_idx_2e17ef41" ON aibot."ChatBotAdapter" ("organizationId");
ALTER TABLE aibot."ChatBotFileSystem" ADD CONSTRAINT "ChatBotFileSystem_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotFileSystem" ADD CONSTRAINT "ChatBotFileSystem_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotFileSystem" ADD CONSTRAINT "ChatBotFileSystem_sandboxId_idx_2b30d542" FOREIGN KEY ("sandboxId") REFERENCES "aibot"."FileSystemAPI" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatBotFileSystem_chatbotId_idx_52db07ea" ON aibot."ChatBotFileSystem" ("chatbotId");
CREATE INDEX "ChatBotFileSystem_organizationId_idx_2e17ef41" ON aibot."ChatBotFileSystem" ("organizationId");
CREATE INDEX "ChatBotFileSystem_sandboxId_idx_2b30d542" ON aibot."ChatBotFileSystem" ("sandboxId");
ALTER TABLE aibot."ChatBotMcpServer" ADD CONSTRAINT "ChatBotMcpServer_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotMcpServer" ADD CONSTRAINT "ChatBotMcpServer_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotMcpServer" ADD CONSTRAINT "ChatBotMcpServer_mcpServerId_idx_1c0baf24" FOREIGN KEY ("mcpServerId") REFERENCES "aibot"."McpServer" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotMcpServer" ADD CONSTRAINT "ChatBotMcpServer_authId_idx_29b6b568" FOREIGN KEY ("authId") REFERENCES "aibot"."OAuthAuthentication" ("id") ON DELETE SET NULL;
ALTER TABLE aibot."ChatBotMcpServer" ADD CONSTRAINT "ChatBotMcpServer_oauthClientId_idx_06565021" FOREIGN KEY ("oauthClientId") REFERENCES "aibot"."OAuthClient" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatBotMcpServer_authId_idx_29b6b568" ON aibot."ChatBotMcpServer" ("authId");
CREATE INDEX "ChatBotMcpServer_chatbotId_idx_52db07ea" ON aibot."ChatBotMcpServer" ("chatbotId");
CREATE INDEX "ChatBotMcpServer_mcpServerId_idx_1c0baf24" ON aibot."ChatBotMcpServer" ("mcpServerId");
CREATE INDEX "ChatBotMcpServer_oauthClientId_idx_06565021" ON aibot."ChatBotMcpServer" ("oauthClientId");
CREATE INDEX "ChatBotMcpServer_organizationId_idx_2e17ef41" ON aibot."ChatBotMcpServer" ("organizationId");
ALTER TABLE aibot."ChatBotPublicId" ADD CONSTRAINT "ChatBotPublicId_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotPublicId" ADD CONSTRAINT "ChatBotPublicId_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatBotPublicId_chatbotId_idx_52db07ea" ON aibot."ChatBotPublicId" ("chatbotId");
CREATE INDEX "ChatBotPublicId_organizationId_idx_2e17ef41" ON aibot."ChatBotPublicId" ("organizationId");
ALTER TABLE aibot."ChatBotSchedule" ADD CONSTRAINT "ChatBotSchedule_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotSchedule" ADD CONSTRAINT "ChatBotSchedule_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatBotSchedule_organizationId_idx_2e17ef41" ON aibot."ChatBotSchedule" ("organizationId");
ALTER TABLE aibot."ChatBotToolSandbox" ADD CONSTRAINT "ChatBotToolSandbox_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotToolSandbox" ADD CONSTRAINT "ChatBotToolSandbox_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatBotToolSandbox" ADD CONSTRAINT "ChatBotToolSandbox_sandboxId_idx_2b30d542" FOREIGN KEY ("sandboxId") REFERENCES "aibot"."Sandbox" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatBotToolSandbox_chatbotId_idx_52db07ea" ON aibot."ChatBotToolSandbox" ("chatbotId");
CREATE INDEX "ChatBotToolSandbox_organizationId_idx_2e17ef41" ON aibot."ChatBotToolSandbox" ("organizationId");
CREATE INDEX "ChatBotToolSandbox_sandboxId_idx_2b30d542" ON aibot."ChatBotToolSandbox" ("sandboxId");
ALTER TABLE aibot."ChatTarget" ADD CONSTRAINT "ChatTarget_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatTarget" ADD CONSTRAINT "ChatTarget_chatbotAdapterId_idx_d49b51ac" FOREIGN KEY ("chatbotAdapterId") REFERENCES "aibot"."ChatBotAdapter" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ChatTarget" ADD CONSTRAINT "ChatTarget_scheduleId_idx_5a3bfbcb" FOREIGN KEY ("scheduleId") REFERENCES "aibot"."ChatBotSchedule" ("id") ON DELETE CASCADE;
CREATE INDEX "ChatTarget_chatbotAdapterId_idx_d49b51ac" ON aibot."ChatTarget" ("chatbotAdapterId");
CREATE INDEX "ChatTarget_organizationId_idx_2e17ef41" ON aibot."ChatTarget" ("organizationId");
CREATE INDEX "ChatTarget_scheduleId_idx_5a3bfbcb" ON aibot."ChatTarget" ("scheduleId");
ALTER TABLE aibot."FileSystemAPI" ADD CONSTRAINT "FileSystemAPI_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."FileSystemAPI" ADD CONSTRAINT "FileSystemAPI_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "FileSystemAPI_organizationId_idx_2e17ef41" ON aibot."FileSystemAPI" ("organizationId");
ALTER TABLE aibot."Grant" ADD CONSTRAINT "Grant_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Grant" ADD CONSTRAINT "Grant_principalId_idx_51ead3c5" FOREIGN KEY ("principalId") REFERENCES "aibot"."PrincipalBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Grant" ADD CONSTRAINT "Grant_resourceId_idx_72964925" FOREIGN KEY ("resourceId") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Grant" ADD CONSTRAINT "Grant_grantedById_idx_416f9b2b" FOREIGN KEY ("grantedById") REFERENCES "aibot"."PrincipalBase" ("id") ON DELETE SET NULL;
CREATE INDEX "Grant_grantedById_idx_416f9b2b" ON aibot."Grant" ("grantedById");
CREATE INDEX "Grant_organizationId_idx_2e17ef41" ON aibot."Grant" ("organizationId");
CREATE INDEX "Grant_principalId_idx_51ead3c5" ON aibot."Grant" ("principalId");
CREATE INDEX "Grant_resourceId_idx_72964925" ON aibot."Grant" ("resourceId");
ALTER TABLE aibot."Group" ADD CONSTRAINT "Group_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."PrincipalBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Group" ADD CONSTRAINT "Group_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "Group_organizationId_idx_2e17ef41" ON aibot."Group" ("organizationId");
ALTER TABLE aibot."McpServer" ADD CONSTRAINT "McpServer_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."McpServer" ADD CONSTRAINT "McpServer_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "McpServer_organizationId_idx_2e17ef41" ON aibot."McpServer" ("organizationId");
ALTER TABLE aibot."Membership" ADD CONSTRAINT "Membership_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Membership" ADD CONSTRAINT "Membership_groupId_idx_e2fb5578" FOREIGN KEY ("groupId") REFERENCES "aibot"."Group" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Membership" ADD CONSTRAINT "Membership_userId_idx_a489d58a" FOREIGN KEY ("userId") REFERENCES "aibot"."User" ("id") ON DELETE CASCADE;
CREATE INDEX "Membership_groupId_idx_e2fb5578" ON aibot."Membership" ("groupId");
CREATE INDEX "Membership_organizationId_idx_2e17ef41" ON aibot."Membership" ("organizationId");
CREATE INDEX "Membership_userId_idx_a489d58a" ON aibot."Membership" ("userId");
ALTER TABLE aibot."OAuthAuthentication" ADD CONSTRAINT "OAuthAuthentication_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."OAuthAuthentication" ADD CONSTRAINT "OAuthAuthentication_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."OAuthAuthentication" ADD CONSTRAINT "OAuthAuthentication_oauthId_idx_b3651b5a" FOREIGN KEY ("oauthId") REFERENCES "aibot"."OAuthClient" ("id") ON DELETE CASCADE;
CREATE INDEX "OAuthAuthentication_oauthId_idx_b3651b5a" ON aibot."OAuthAuthentication" ("oauthId");
CREATE INDEX "OAuthAuthentication_organizationId_idx_2e17ef41" ON aibot."OAuthAuthentication" ("organizationId");
ALTER TABLE aibot."OAuthClient" ADD CONSTRAINT "OAuthClient_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."OAuthClient" ADD CONSTRAINT "OAuthClient_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "OAuthClient_organizationId_idx_2e17ef41" ON aibot."OAuthClient" ("organizationId");
CREATE INDEX "OAuthRevocationQueue_nextAttemptAt_id_idx_c433e4eb" ON aibot."OAuthRevocationQueue" ("nextAttemptAt", "id");
CREATE INDEX "OAuthRevocationSnapshot_oauthId_idx_b3651b5a" ON aibot."OAuthRevocationSnapshot" ("oauthId");
ALTER TABLE aibot."Organization" ADD CONSTRAINT "Organization_temporaryFileSystemApiId_idx_d50d93e3" FOREIGN KEY ("temporaryFileSystemApiId") REFERENCES "aibot"."FileSystemAPI" ("id") ON DELETE SET NULL;
CREATE INDEX "Organization_temporaryFileSystemApiId_idx_d50d93e3" ON aibot."Organization" ("temporaryFileSystemApiId");
ALTER TABLE aibot."PersistentSandboxInstance" ADD CONSTRAINT "PersistentSandboxInstance_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."PersistentSandboxInstance" ADD CONSTRAINT "PersistentSandboxInstance_apiId_idx_a7249ccd" FOREIGN KEY ("apiId") REFERENCES "aibot"."SandboxAPI" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."PersistentSandboxInstance" ADD CONSTRAINT "PersistentSandboxInstance_sandboxId_idx_2b30d542" FOREIGN KEY ("sandboxId") REFERENCES "aibot"."Sandbox" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."PersistentSandboxInstance" ADD CONSTRAINT "PersistentSandboxInstance_adapterId_idx_f5208af9" FOREIGN KEY ("adapterId") REFERENCES "aibot"."ChatAdapter" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."PersistentSandboxInstance" ADD CONSTRAINT "PersistentSandboxInstance_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE CASCADE;
CREATE INDEX "PersistentSandboxInstance_adapterId_idx_f5208af9" ON aibot."PersistentSandboxInstance" ("adapterId");
CREATE INDEX "PersistentSandboxInstance_apiId_idx_a7249ccd" ON aibot."PersistentSandboxInstance" ("apiId");
CREATE INDEX "PersistentSandboxInstance_chatbotId_idx_52db07ea" ON aibot."PersistentSandboxInstance" ("chatbotId");
CREATE INDEX "PersistentSandboxInstance_organizationId_idx_2e17ef41" ON aibot."PersistentSandboxInstance" ("organizationId");
CREATE INDEX "PersistentSandboxInstance_sandboxId_idx_2b30d542" ON aibot."PersistentSandboxInstance" ("sandboxId");
ALTER TABLE aibot."PrincipalBase" ADD CONSTRAINT "PrincipalBase_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "PrincipalBase_organizationId_idx_2e17ef41" ON aibot."PrincipalBase" ("organizationId");
ALTER TABLE aibot."Provider" ADD CONSTRAINT "Provider_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Provider" ADD CONSTRAINT "Provider_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "Provider_organizationId_idx_2e17ef41" ON aibot."Provider" ("organizationId");
ALTER TABLE aibot."RateLimit" ADD CONSTRAINT "RateLimit_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."RateLimit" ADD CONSTRAINT "RateLimit_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "RateLimit_organizationId_idx_2e17ef41" ON aibot."RateLimit" ("organizationId");
ALTER TABLE aibot."ResourceBase" ADD CONSTRAINT "ResourceBase_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "ResourceBase_organizationId_idx_2e17ef41" ON aibot."ResourceBase" ("organizationId");
ALTER TABLE aibot."Sandbox" ADD CONSTRAINT "Sandbox_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Sandbox" ADD CONSTRAINT "Sandbox_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Sandbox" ADD CONSTRAINT "Sandbox_apiId_idx_a7249ccd" FOREIGN KEY ("apiId") REFERENCES "aibot"."SandboxAPI" ("id") ON DELETE CASCADE;
CREATE INDEX "Sandbox_apiId_idx_a7249ccd" ON aibot."Sandbox" ("apiId");
CREATE INDEX "Sandbox_organizationId_idx_2e17ef41" ON aibot."Sandbox" ("organizationId");
ALTER TABLE aibot."SandboxAPI" ADD CONSTRAINT "SandboxAPI_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."ResourceBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."SandboxAPI" ADD CONSTRAINT "SandboxAPI_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "SandboxAPI_organizationId_idx_2e17ef41" ON aibot."SandboxAPI" ("organizationId");
ALTER TABLE aibot."Session" ADD CONSTRAINT "Session_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."Session" ADD CONSTRAINT "Session_userId_idx_a489d58a" FOREIGN KEY ("userId") REFERENCES "aibot"."User" ("id") ON DELETE CASCADE;
CREATE INDEX "Session_expiresAt_idx_6b6b8c10" ON aibot."Session" ("expiresAt");
CREATE INDEX "Session_organizationId_idx_2e17ef41" ON aibot."Session" ("organizationId");
CREATE INDEX "Session_userId_idx_a489d58a" ON aibot."Session" ("userId");
ALTER TABLE aibot."ThreadOAuthConnection" ADD CONSTRAINT "ThreadOAuthConnection_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ThreadOAuthConnection" ADD CONSTRAINT "ThreadOAuthConnection_oauthClientId_idx_06565021" FOREIGN KEY ("oauthClientId") REFERENCES "aibot"."OAuthClient" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ThreadOAuthConnection" ADD CONSTRAINT "ThreadOAuthConnection_chatbotId_idx_52db07ea" FOREIGN KEY ("chatbotId") REFERENCES "aibot"."ChatBot" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ThreadOAuthConnection" ADD CONSTRAINT "ThreadOAuthConnection_adapterId_idx_f5208af9" FOREIGN KEY ("adapterId") REFERENCES "aibot"."ChatAdapter" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."ThreadOAuthConnection" ADD CONSTRAINT "ThreadOAuthConnection_authenticationId_fkey" FOREIGN KEY ("authenticationId") REFERENCES "aibot"."OAuthAuthentication" ("id") ON DELETE CASCADE;
CREATE INDEX "ThreadOAuthConnection_adapterId_idx_f5208af9" ON aibot."ThreadOAuthConnection" ("adapterId");
CREATE INDEX "ThreadOAuthConnection_chatbotId_idx_52db07ea" ON aibot."ThreadOAuthConnection" ("chatbotId");
CREATE INDEX "ThreadOAuthConnection_oauthClientId_idx_06565021" ON aibot."ThreadOAuthConnection" ("oauthClientId");
CREATE INDEX "ThreadOAuthConnection_organizationId_idx_2e17ef41" ON aibot."ThreadOAuthConnection" ("organizationId");
ALTER TABLE aibot."User" ADD CONSTRAINT "User_id_fkey" FOREIGN KEY ("id") REFERENCES "aibot"."PrincipalBase" ("id") ON DELETE CASCADE;
ALTER TABLE aibot."User" ADD CONSTRAINT "User_organizationId_idx_2e17ef41" FOREIGN KEY ("organizationId") REFERENCES "aibot"."Organization" ("id") ON DELETE CASCADE;
CREATE INDEX "User_organizationId_idx_2e17ef41" ON aibot."User" ("organizationId");
