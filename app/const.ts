export const APP_NAME = "AI Bots";
export const OAUTH_CALLBACK_PATH = "oauth/callback";
export const STATE_SCHEMA_NAME = "aibot_state";
export const ENTITY_PAGE_SIZE = 25;
export const DATA_PERSISTENCE_SCOPES = {
  nopersistence: "pages.bots.dataPersistenceScopeNopersistenceOption",
  thread: "pages.bots.dataPersistenceScopeThreadOption",
  bot: "pages.bots.dataPersistenceScopeBotOption",
} as const;
