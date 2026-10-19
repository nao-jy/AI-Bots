export type EntityValues = Record<string, string>;
export type EntityRecord = { id: number; updated: string } & Record<string, string | number>;

type Collection = "bots" | "adapters" | "agents" | "mcpServers" | "users";

const collections: Record<Collection, EntityRecord[]> = {
  bots: [
    { id: 1, name: "カスタマーサポート", description: "問い合わせ対応とFAQ案内", agent: "カスタマーサポート", adapters: "サポート窓口", status: "稼働中", updated: "今日" },
    { id: 2, name: "社内ナレッジアシスタント", description: "社内ドキュメントを検索して回答", agent: "社内ナレッジアシスタント", adapters: "社内ワークスペース", status: "稼働中", updated: "今日" },
    { id: 3, name: "議事録まとめボット", description: "会議の要点を整理して共有", agent: "カスタマーサポート", adapters: "開発コミュニティ", status: "停止中", updated: "昨日" },
  ],
  adapters: [
    { id: 1, name: "サポート窓口", platform: "Slack", bot: "カスタマーサポート", status: "接続済み", updated: "今日" },
    { id: 2, name: "社内ワークスペース", platform: "Microsoft Teams", bot: "社内ナレッジアシスタント", status: "接続済み", updated: "昨日" },
    { id: 3, name: "開発コミュニティ", platform: "Discord", bot: "議事録まとめボット", status: "停止中", updated: "3日前" },
  ],
  agents: [
    { id: 1, name: "カスタマーサポート", provider: "OpenAI", model: "gpt-4.1", tools: "チケット検索", status: "2 ボットで利用中", updated: "今日" },
    { id: 2, name: "社内ナレッジアシスタント", provider: "Anthropic", model: "claude-sonnet-4", tools: "ナレッジ検索 · 社内Wiki", status: "1 ボットで利用中", updated: "昨日" },
  ],
  mcpServers: [
    { id: 1, name: "ナレッジ検索", transport: "Streamable HTTP", endpoint: "mcp.internal.example.com", tools: "search_documents, get_document", status: "接続済み", updated: "今日" },
    { id: 2, name: "チケット検索", transport: "SSE", endpoint: "tickets.example.com/mcp", tools: "search_tickets, get_ticket", status: "接続済み", updated: "昨日" },
    { id: 3, name: "社内Wiki", transport: "Streamable HTTP", endpoint: "wiki.example.com/mcp", tools: "search_pages", status: "未接続", updated: "3日前" },
  ],
  users: [
    { id: 1, name: "佐藤 美咲", email: "misaki@example.com", role: "管理者", status: "有効", updated: "今日" },
    { id: 2, name: "田中 健", email: "ken@example.com", role: "メンバー", status: "有効", updated: "昨日" },
    { id: 3, name: "山田 花子", email: "hanako@example.com", role: "メンバー", status: "招待中", updated: "3日前" },
  ],
};

function list(collection: Collection) {
  return collections[collection].map((record) => ({ ...record }));
}

function create(collection: Collection, values: EntityValues) {
  const nextId = Math.max(0, ...collections[collection].map((record) => record.id)) + 1;
  const record = { ...values, id: nextId, updated: new Date().toLocaleString("ja-JP") };
  collections[collection].unshift(record);
  return { ...record };
}

function update(collection: Collection, id: number, values: EntityValues) {
  const index = collections[collection].findIndex((record) => record.id === id);
  if (index < 0) return null;
  const record = { ...collections[collection][index], ...values, id, updated: new Date().toLocaleString("ja-JP") };
  collections[collection][index] = record;
  return { ...record };
}

function remove(collection: Collection, id: number) {
  const originalLength = collections[collection].length;
  collections[collection] = collections[collection].filter((record) => record.id !== id);
  return collections[collection].length !== originalLength;
}

export const listBots = () => list("bots");
export const createBot = (values: EntityValues) => create("bots", values);
export const updateBot = (id: number, values: EntityValues) => update("bots", id, values);
export const deleteBot = (id: number) => remove("bots", id);

export const listAdapters = () => list("adapters");
export const createAdapter = (values: EntityValues) => create("adapters", values);
export const updateAdapter = (id: number, values: EntityValues) => update("adapters", id, values);
export const deleteAdapter = (id: number) => remove("adapters", id);

export const listAgents = () => list("agents");
export const createAgent = (values: EntityValues) => create("agents", values);
export const updateAgent = (id: number, values: EntityValues) => update("agents", id, values);
export const deleteAgent = (id: number) => remove("agents", id);

export const listMcpServers = () => list("mcpServers");
export const createMcpServer = (values: EntityValues) => create("mcpServers", values);
export const updateMcpServer = (id: number, values: EntityValues) => update("mcpServers", id, values);
export const deleteMcpServer = (id: number) => remove("mcpServers", id);

export const listUsers = () => list("users");
export const createUser = (values: EntityValues) => create("users", values);
export const updateUser = (id: number, values: EntityValues) => update("users", id, values);
export const deleteUser = (id: number) => remove("users", id);
