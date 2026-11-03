# AI Bots

**AI Bots** is a web workspace for configuring AI-powered chatbots and the services they use. Connect chat platforms, choose an AI model, add tools and MCP servers, run code in managed sandboxes, and schedule prompts for chat threads.

[日本語](./README.ja.md)

## Features

- **Chatbots:** Configure instructions, failure messages, conversation history, enabled state, and the services available to each bot. View and regenerate public IDs and copy adapter webhook URLs.
- **Chat adapters:** Connect Slack, Microsoft Teams, Google Chat, Discord, X, and LINE. Configure platform-specific settings, optionally link OAuth credentials, and test adapter connections.
- **AI providers and agents:** Configure OpenAI, Azure OpenAI, Anthropic, or an OpenAI-compatible provider, then define agents with a model ID and model options. Test agents before assigning them to bots.
- **Tools and files:** Give bots access to chat and attachment tools, Google Drive, OpenDAL-backed remote file stores, and King of Time attendance data. Tool availability depends on each bot's configuration and connected credentials.
- **MCP servers:** Configure MCP endpoints and HTTP headers, test connections, and make the servers available to bots.
- **Sandboxes:** Configure E2B or OpenSandbox execution environments, including environment variables, allowed network domains, initialization commands, and sharing scope. Inspect persistent instances and use the built-in terminal.
- **Scheduled prompts:** Run a prompt on selected bot/adapter threads using a five-field or six-field Cron expression and an IANA timezone. Schedule changes are synchronized with the running scheduler.
- **OAuth and users:** Manage OAuth clients and authorize accounts for integrations. The first user is registered through the login page; authenticated users can manage workspace accounts.

## Requirements

- Node.js 24 or later
- PostgreSQL 15 or later
- npm

The provided Compose configuration uses PostgreSQL 16. SearXNG and OpenSandbox are also defined there for optional integrations.

## Getting started

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create a root-level `.env` file with the database URL and an encryption key:

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
   docker compose --env-file .env -f infra/compose.yaml up -d postgres
   ```

   Wait for the database to become healthy, then initialize the database tables on first setup:

   ```bash
   npx prisma db init
   ```

4. Start the application:

   ```bash
   npm run dev:app
   ```

   Open `http://localhost:5173`. On the first visit, create the initial user account. `npm run dev` also starts the app and runs a Cloudflare Tunnel when `CLOUDFLARE_TOKEN` is set; use `npm run dev:app` for local development without the tunnel.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by the app and chat state store. |
| `CREDENTIALS_ENCRYPTION_KEY` | Yes | Base64-encoded 32-byte key for encrypting credentials and signing OAuth authorization state. |
| `OAUTH_BASE_URL` | For OAuth | Public HTTPS origin (no path) used to form the OAuth callback URL, `/oauth/callback`. `http://localhost` is allowed for local development. Register the resulting callback URL with the OAuth provider. |
| `PUBLIC_APP_URL` | Optional | Public application URL used when generating webhook URLs. If unset, the request origin is used. |
| `E2B_API_KEY` | Optional | Enables the E2B sandbox provider. |
| `OPEN_SANDBOX_DOMAIN` | Optional | Enables OpenSandbox and sets its connection domain. |
| `OPEN_SANDBOX_API_KEY` | Optional | API key passed to the OpenSandbox server in the included Compose setup. |
| `SEARXNG_URL` | Optional | SearXNG endpoint for the web search tool. |
| `CLOUDFLARE_TOKEN` | Optional | Cloudflare Tunnel token used by `npm run dev`. |
| `LOG_DIR` | Optional | Log directory; defaults to `logs`. |

`infra/compose.yaml` defines PostgreSQL, SearXNG, and OpenSandbox. To start the optional services as well, make sure `infra/.env` exists (copy `infra/sample.env` if needed) and run:

```bash
docker compose --env-file .env -f infra/compose.yaml up -d
```

Configure each integration's provider credentials and settings in the workspace. Sandbox providers appear in the UI when their corresponding environment variables are set.

## Build and run

```bash
npm run typecheck
npm run build
npm run start
```

The production server needs the same environment variables and a reachable, initialized PostgreSQL database.

### Docker

Build and run the production image:

```bash
docker build -t ai-bots .
docker run --env-file .env -p 3000:3000 ai-bots
```

Provide a production `DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY`, and any integration-specific settings to the container. Use HTTPS at the public ingress and set `OAUTH_BASE_URL` to that public origin when using OAuth.
