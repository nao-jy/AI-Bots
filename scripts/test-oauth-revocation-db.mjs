// Runs against an isolated schema in a transaction that is always rolled back.
import dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.dev" });
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query('CREATE SCHEMA oauth_revocation_test');
  await client.query(`CREATE TABLE oauth_revocation_test."OAuthClient" (
    id uuid PRIMARY KEY, "clientId" text NOT NULL, "clientSecret" text, "revocationEndpoint" text)`);
  await client.query(`CREATE TABLE oauth_revocation_test."OAuthAuthentication" (
    id uuid PRIMARY KEY, "oauthId" uuid NOT NULL REFERENCES oauth_revocation_test."OAuthClient" ON DELETE CASCADE,
    "accessToken" text NOT NULL, "refreshToken" text)`);
  const operations = JSON.parse(await readFile(new URL("../migrations/app/20261107T0828_oauth_revocation/ops.json", import.meta.url), "utf8"));
  const runOperation = async (operation) => {
    for (const step of operation.execute)
      await client.query(step.sql.replaceAll('"aibot".', '"oauth_revocation_test".').replaceAll("aibot.", "oauth_revocation_test."));
  };
  const clientId = "00000000-0000-0000-0000-000000000001";
  const authId = "00000000-0000-0000-0000-000000000002";
  await client.query('INSERT INTO oauth_revocation_test."OAuthClient" VALUES ($1, $2, $3, $4)', [clientId, "old", "secret", "https://example.com/revoke"]);
  await client.query('INSERT INTO oauth_revocation_test."OAuthAuthentication" VALUES ($1, $2, $3, $4)', [authId, clientId, "access", "refresh"]);
  for (const operation of operations) await runOperation(operation); // Backfill existing credentials.
  await runOperation(operations.find((operation) => operation.id === "oauth.revocation.triggers"));
  await client.query('UPDATE oauth_revocation_test."OAuthClient" SET "clientId" = $1 WHERE id = $2', ["updated", clientId]);
  await client.query('SAVEPOINT before_delete');
  await client.query('DELETE FROM oauth_revocation_test."OAuthClient" WHERE id = $1', [clientId]);
  let result = await client.query('SELECT * FROM oauth_revocation_test."OAuthRevocationQueue"');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].clientId, "updated");
  assert.equal(result.rows[0].accessToken, "access");
  assert.equal(result.rows[0].refreshToken, "refresh");
  await client.query('ROLLBACK TO SAVEPOINT before_delete');
  result = await client.query('SELECT * FROM oauth_revocation_test."OAuthRevocationQueue"');
  assert.equal(result.rows.length, 0);
  await client.query('DELETE FROM oauth_revocation_test."OAuthAuthentication" WHERE id = $1', [authId]);
  result = await client.query('SELECT * FROM oauth_revocation_test."OAuthRevocationQueue"');
  assert.equal(result.rows.length, 1);
  result = await client.query('SELECT * FROM oauth_revocation_test."OAuthRevocationSnapshot"');
  assert.equal(result.rows.length, 0);
  await client.query('INSERT INTO oauth_revocation_test."OAuthAuthentication" VALUES ($1, $2, $3, $4)', [authId, clientId, "new-access", null]);
  await client.query('DELETE FROM oauth_revocation_test."OAuthClient" WHERE id = $1', [clientId]);
  result = await client.query('SELECT * FROM oauth_revocation_test."OAuthRevocationQueue" ORDER BY id');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].accessToken, "new-access");
  await client.query(`UPDATE oauth_revocation_test."OAuthRevocationQueue" SET attempts = attempts + 1,
    "nextAttemptAt" = now() + make_interval(secs => LEAST(86400, 60 * power(2, LEAST(attempts, 10)))::double precision)
    WHERE id = $1`, [result.rows[1].id]);
  console.log("OAuth revocation trigger integration checks passed.");
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
