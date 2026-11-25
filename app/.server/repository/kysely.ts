import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "./db-schema";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
});

export const kysely = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
