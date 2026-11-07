export const APP_NAME = "AI Bots";
export const OAUTH_CALLBACK_PATH = "oauth/callback";
export const STATE_SCHEMA_NAME = "aibot_state";
export const ENTITY_PAGE_SIZE = 25;
export const SANDBOX_SCOPES = {
  turn: "sandboxScopes.turn",
  thread: "sandboxScopes.thread",
  adapter: "sandboxScopes.adapter",
  bot: "sandboxScopes.bot",
  all: "sandboxScopes.all",
} as const;
