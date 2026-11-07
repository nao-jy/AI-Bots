import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const sql = await readFile(new URL("../migrations/custom/oauth-revocation.sql", import.meta.url), "utf8");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("OAuth revocation triggers installed.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Could not install OAuth revocation triggers:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
