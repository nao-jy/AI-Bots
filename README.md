# AI Bots

**Bring an AI bot that's yours into the chats you already use.**

AI Bots is a self-hosted web workspace for building and running bots in Slack, Microsoft Teams, and other chat platforms. Keep the database and stored credentials in an environment you control, and deploy it to meet your organization's security requirements. Choose a model, then configure each bot's access to files and services, code execution, scheduled prompts, and usage limits.

[日本語](./README.ja.md) · [What can you build?](#what-can-you-build) · [Customization](#customization) · [Getting started](#getting-started)

## What can you build?

| Goal                           | Example setup in AI Bots                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Answer team questions in chat  | Assign a Slack or Teams adapter and an AI agent to a bot; configure its instructions and conversation history. |
| Find and use documents         | Connect an MCP server that provides document tools to a bot.       |
| Post to a thread every morning | Schedule a prompt for a selected bot and thread with a Cron expression and timezone.                           |
| Work with files from chat      | Combine attachment reading, file posting, and optional code execution in a sandbox.                            |
| Control usage and access       | Set rate limits for bots, agents, or providers and resource permissions for users or groups.                   |

For example, to run a bot that posts a recurring checklist to a team thread on weekday mornings, configure a **chat adapter → AI agent → bot → schedule**. You can also connect an MCP server when that bot needs an external source of information.

## Features

- **Chatbots:** Configure instructions, failure messages, conversation history, enabled state, and the services available to each bot. View and regenerate public IDs and copy adapter webhook URLs.
- **Chat adapters:** Connect Slack, Microsoft Teams, Google Chat, Discord, X, and LINE. Configure platform-specific settings, optionally link OAuth credentials, and test adapter connections.
- **AI providers and agents:** Configure OpenAI, Azure OpenAI, Anthropic, or an OpenAI-compatible provider, then define agents with a model ID and model options. Test agents before assigning them to bots.
- **Tools and files:** Give bots access to chat and attachment tools and connected MCP servers. Tool availability depends on each bot's configuration and connected credentials.
- **Web search and memory:** Connect a web search MCP server to enable search. Choose whether a bot's memory is disabled, kept per thread, or shared across the bot.
- **MCP servers:** Configure MCP endpoints and HTTP headers, test connections, and make the servers available to bots.

- **Sandboxes:** Configure Sandbox API execution environments, including environment variables, allowed network domains, initialization commands, and sharing scope. Inspect persistent instances and use the built-in terminal.
- **Scheduled prompts:** Run a prompt on selected bot/adapter threads using a five-field or six-field Cron expression and an IANA timezone. Schedule changes are synchronized with the running scheduler.
- **Usage and rate limits:** View request and token usage over the last 30 days in the dashboard. Set limits for a bot, agent, or provider, aggregate usage per thread or across the target, and choose a Cron expression and timezone for the reset boundary. Configure the message shown when a limit is reached.
- **Execution history:** Review the status, time, and failure reason of bot runs from chat and schedules. The dashboard shows failures from the last 24 hours, and the execution history page filters by bot, status, and period. Bot access permissions govern which runs a user can view.
- **Groups and permissions:** Administrators can manage group membership and grant users or groups access to resources such as bots.
- **List search:** Management lists support name-based search and server-side pagination in pages of 25 records.
- **OAuth and users:** Manage OAuth accounts for integrations, workspace users, TOTP-based MFA, email verification, and password resets. See [Users and authentication](#users-and-authentication) for details.

The separate bot_tools MCP servers provide Google Drive and OpenDAL remote file tools. They return files of up to 10 MiB for use with the bot's file parsing and chat attachment tools. Configure their context schema URLs and OAuth connections as described in the bot_tools README.

## Customization

When you need a service or execution environment that is not included, implement the corresponding interface and wire it into the app. The existing integrations are a starting point. For an OpenAI-compatible API, you can also configure the built-in **OpenAI Compatible** provider without writing a new one.

| Extension             | Interface and example                                                                                                                                               | Where to wire it in                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Another chat platform | Implement the Chat SDK `Adapter`; see the [Slack adapter integration](./app/.server/features/chat-adapter.ts).                                                      | Add a `ChatAdapterFactory` entry to `FACTORIES` in the same file.                                |
| Another AI provider   | `ModelFactory`; see the [OpenAI implementation](./app/.server/features/provider.ts).                                                                                | Add an entry to `FACTORIES` in the same file.                                                    |
| Another memory store  | [`FileSystem` interface](./app/.server/features/filesystem/index.ts) and [filesystem API client](./app/.server/features/filesystem/api.ts).                    | Replace the `ApiFileSystem` construction in [bot processing](./app/.server/features/bot.ts). |
| Another email service | [`EmailProvider` interface](./app/.server/features/email-providers/index.ts) and [SMTP relay implementation](./app/.server/features/email-providers/smtp-relay.ts). | Select it in `getEmailProvider()` in `email-providers/index.ts`.                                 |

The file system interface backs bot memory and temporary file storage. Chat attachments use separate tools.

## Requirements

- Node.js 24 or later
- PostgreSQL 15 or later
- npm

The provided Compose configuration uses PostgreSQL 16.

## Getting started

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy [`.env.example`](./.env.example) to `.env.dev` and configure the database URL and an encryption key:

   ```dotenv
   DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
   CREDENTIALS_ENCRYPTION_KEY="<base64-encoded 32-byte key>"
   ```

   Generate a key with:

   ```bash
   openssl rand -base64 32
   ```

   Keep this key private and persistent. It is used to encrypt stored credentials; changing it makes existing encrypted credentials unreadable.

3. Start PostgreSQL. To use the included Compose service:

   ```bash
   docker compose --env-file .env.dev -f infra/compose.yaml up -d postgres
   ```

   Wait for the database to become healthy, then initialize the database tables on first setup:

   ```bash
   npx prisma db migrate
   ```

   Run `npx prisma db migrate` before starting a new application version when upgrading an existing database too. The migrations create the OAuth revocation tables and install deletion triggers and backfill existing snapshots. Run migrations from a checkout with development dependencies installed; the production image does not include the Prisma CLI. The database user needs permission to create tables, functions and triggers in the `aibot` schema. Use `db migrate` rather than `db init` or `db update`: those commands do not execute the trigger and backfill migration.

   Deleted OAuth credentials are queued for asynchronous revocation, including when deleted by a cascade. The application retries failures with backoff and logs them. Set a revocation endpoint on every OAuth client; jobs without one remain pending. Pending jobs retain encrypted tokens and client secrets until revocation succeeds, so monitor the logs and the `aibot."OAuthRevocationQueue"` table for persistent failures. Keep `CREDENTIALS_ENCRYPTION_KEY` available to process pending jobs.

   Jobs contain a snapshot taken at deletion: changing the OAuth client later does not change existing jobs. If an endpoint or client setting was wrong, an administrator must correct the corresponding queue row and set `"nextAttemptAt" = now()` to retry immediately. Secrets in the queue use the application's encrypted credential format; do not insert plaintext secrets.

4. Start the application:

   ```bash
   npm run dev:app
   ```

   Open `http://localhost:5173`. On the first visit, create the initial user account. `npm run dev` also starts the app and runs a Cloudflare Tunnel when `CLOUDFLARE_TOKEN` is set; use `npm run dev:app` for local development without the tunnel.

## Run your first bot

1. In **AI providers**, add credentials for your model. In **Agents**, enter its model ID and run an agent test to check the response.
2. In **Chat adapters**, add connection details for a platform such as Slack and test the connection.
3. Create a **Chatbot** and assign the agent and adapter. For example, set its instructions to “Answer briefly; if you do not know, say so instead of guessing.”
4. Copy that adapter's **Webhook URL** from the bot list and register it with the chat platform. The app needs a publicly reachable URL to receive external webhooks.
5. Send a message in the connected chat to check the response. Add tools, MCP servers, memory, or schedules as needed.

Follow the chosen platform's instructions for credentials and webhook registration. The included Cloudflare Tunnel setup can expose a local app to external webhooks.

## Users and authentication

Manage OAuth clients and authorize accounts for integrations. The first user registered through the login page becomes an administrator. Only administrators can manage workspace accounts and grant or revoke administrator privileges; at least one administrator is always required.

Administrators can require TOTP-based MFA and configure session duration and the maximum number of failed logins in Settings. Users who reach the failed-login limit are locked and can be unlocked from the users page. Individual MFA credentials can also be reset there.

The built-in email provider sends through an SMTP relay. Once configured, it can send verification messages when creating the initial administrator, creating users, or changing their email addresses. Verified users can request password reset emails from the login page; links expire after one hour. Administrators can resend verification messages from the users page. See [`.env.example`](./.env.example) for an SMTP relay configuration example.

## Configuration

| Variable                     | Required  | Purpose                                                                                                                                                                                                 |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`               | Yes       | PostgreSQL connection string used by the app and chat state store.                                                                                                                                      |
| `CREDENTIALS_ENCRYPTION_KEY` | Yes       | Base64-encoded 32-byte key for encrypting credentials and signing OAuth authorization state.                                                                                                            |
| `OAUTH_BASE_URL`             | For OAuth | Public HTTPS origin (no path) used to form the OAuth callback URL, `/oauth/callback`. `http://localhost` is allowed for local development. Register the resulting callback URL with the OAuth provider. |
| `PUBLIC_APP_URL`             | Optional  | Public application URL used for webhook URLs, email verification links, and temporary file download links. If unset, the request origin is used.                                                        |
| `SMTP_RELAY_HOST`            | For email | SMTP relay host.                                                                                                                                                                                        |
| `SMTP_RELAY_PORT`            | For email | SMTP relay port.                                                                                                                                                                                        |
| `SMTP_RELAY_SECURE`          | For email | Set to `true` for TLS; when `false`, STARTTLS is required.                                                                                                                                              |
| `SMTP_RELAY_USER`            | For email | SMTP authentication username.                                                                                                                                                                           |
| `SMTP_RELAY_PASS`            | For email | SMTP authentication password.                                                                                                                                                                           |
| `SMTP_RELAY_DOMAIN_FROM`     | For email | Domain used for the `noreply@<domain>` sender address.                                                                                                                                                  |
| `CLOUDFLARE_TOKEN`           | Required for production Docker | Cloudflare Tunnel token; also optionally used by `npm run dev`.                                                                                                                  |
| `FILESYSTEM_API_URL`         | Required  | Filesystem API URL for legacy environment-based storage; the bundled bot_tools API is available inside the shared Docker network. |
| `FILESYSTEM_API_TOKEN`       | Required  | Bearer token shared with the filesystem API. |
| `MEMORY_STORAGE_SERVICE`, `TEMP_FILE_STORAGE_SERVICE` | Optional | OpenDAL service names for bot memory and temporary files; default `fs`. |
| `MEMORY_STORAGE_CONFIG`, `TEMP_FILE_STORAGE_CONFIG` | Optional | OpenDAL configuration as JSON objects with string values. For `fs`, `root` is relative to the API server's allowed root. |
| `LOG_DIR`                    | Optional  | Log directory; defaults to `logs`.                                                                                                                                                                      |

`infra/compose.yaml` defines PostgreSQL. From the repository root, start it using the same `.env.dev` file:

```bash
docker compose --env-file .env.dev -f infra/compose.yaml up -d
```

Optional Compose settings are documented in [`.env.example`](./.env.example). If you change the PostgreSQL credentials, update `DATABASE_URL` to match; existing database volumes retain their original credentials.

Configure each integration's provider credentials and settings in the workspace. Administrators register Sandbox and Filesystem API endpoints and headers in Settings. Use `http://bot-tools/sandbox` and `http://bot-tools/filesystem` for the bundled APIs. Select a Sandbox API when creating a sandbox, and select a Filesystem API for bot memory or as the organization’s temporary file store. Filesystem contexts and headers are encrypted at rest. Administrators can browse the configured filesystem from the Files page. The Filesystem API must support `POST /v1/list` in `directory` mode; update bot_tools before using the browser. Keep an old temporary-file API registered until its download links expire. To connect the included OpenSandbox through bot_tools, follow the Sandbox API setup in the bot_tools README; direct E2B integration has been removed.

The API configuration migration removes pre-release sandbox records and their persistent instance records; it does not terminate existing remote instances. Apply migrations before starting this version, then register the APIs in Settings.

## Build and run

```bash
npm run typecheck
npm run build
npm run start
```

`npm run start` loads `.env.prd`. The production server needs a reachable, initialized PostgreSQL database. To migrate production, run `DOTENV_CONFIG_PATH=.env.prd npx prisma db migrate` with a database address reachable from the machine running the command; the Docker-only `postgres` hostname may not resolve on the host.

### Docker

#### Production Compose

Start bot_tools first to create the shared `bot-tools-mcp` network. See its README for the startup commands. Its services publish no host ports, so a bot_manager development process running on the host cannot access them directly.


Configure `.env.prd` using [`.env.prd.example`](./.env.prd.example). If `.env.prd` already exists, preserve it and check `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` with matching credentials. The `DATABASE_URL` host and port are `postgres:5432`. Percent-encode reserved characters in database credentials in the URL. Configure the sample `SMTP_RELAY_*` settings to use email verification and password reset.

For a new production environment, use a dedicated `CREDENTIALS_ENCRYPTION_KEY` and Cloudflare Tunnel. Configure the Tunnel's public hostname to reach `http://127.0.0.1:3001` inside the container. Use separate development and production Tunnels: running both connectors on the same Tunnel can route requests to either environment. Restrict access with Cloudflare Access or an equivalent policy until the initial administrator is created.

```bash
docker compose --env-file .env.prd -f infra/compose.production.yaml up -d postgres
docker compose --env-file .env.prd -f infra/compose.production.yaml run --rm --build migrate
docker compose --env-file .env.prd -f infra/compose.production.yaml up -d --build
```

Run `run --rm --build migrate` before starting a new application version when upgrading. View application logs with `docker compose --env-file .env.prd -f infra/compose.production.yaml logs -f app`.

The production Compose project creates separate volumes from development. PostgreSQL is not published to the host; containers connect to `postgres:5432`. Logs, memories, and temporary files use a production-specific volume. To access PostgreSQL directly, connect from inside its container:

```bash
docker compose --env-file .env.prd -f infra/compose.production.yaml \
  exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

If you change `LOG_DIR`, keep it inside the `/app/data` volume or mount a separate volume there. Rebuild the image to update `cloudflared`.

**Migrating an existing installation:** The new database and application volume start empty. The existing database and `bot-data` volume are not migrated automatically. Prepare a backup and restore procedure to retain them, and keep the original `CREDENTIALS_ENCRYPTION_KEY` to decrypt existing data. Compose does not stop the existing `ai-bots` container, so avoid running both installations during the cutover.
