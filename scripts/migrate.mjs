import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run database migrations");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("CREATE SCHEMA IF NOT EXISTS aibot");
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('bot_manager_sql_migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS aibot."SchemaMigration" (
    "name" text PRIMARY KEY,
    "appliedAt" timestamptz NOT NULL DEFAULT now()
  )`);

  const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
  const files = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const name of files) {
    const applied = await client.query(
      'SELECT 1 FROM aibot."SchemaMigration" WHERE name = $1',
      [name],
    );
    if (applied.rowCount) continue;
    const sql = await readFile(join(directory, name), "utf8");
    await client.query(sql);
    await client.query('INSERT INTO aibot."SchemaMigration" (name) VALUES ($1)', [name]);
    console.log(`Applied ${name}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
