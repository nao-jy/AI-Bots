import pg from "pg";
import * as oidc from "openid-client";
import { decryptCredential } from "../utils";
import { appLogger } from "../logger/app-logger";

type Revocation = {
  id: string;
  authenticationId: string;
  clientId: string;
  clientSecret: string | null;
  revocationEndpoint: string | null;
  accessToken: string;
  refreshToken: string | null;
};

const globalWorker = globalThis as typeof globalThis & {
  __oauthRevocationWorker?: {
    timer: ReturnType<typeof setInterval>;
    pool: pg.Pool;
  };
};

async function revoke(row: Revocation) {
  if (!row.revocationEndpoint)
    throw new Error("Revocation endpoint is not configured");
  const endpoint = new URL(row.revocationEndpoint);
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:")
    throw new Error("Invalid revocation endpoint");
  const secret = row.clientSecret
    ? decryptCredential(row.clientSecret)
    : undefined;
  const config = new oidc.Configuration(
    {
      issuer: endpoint.origin,
      revocation_endpoint: endpoint.href,
    } as oidc.ServerMetadata,
    row.clientId,
    secret,
    secret ? oidc.ClientSecretPost(secret) : oidc.None(),
  );
  config.timeout = 10;
  // Attempt both tokens even if one fails; keep the job until both succeed.
  const results = await Promise.allSettled([
    ...(row.refreshToken
      ? [
          oidc.tokenRevocation(config, decryptCredential(row.refreshToken), {
            token_type_hint: "refresh_token",
          }),
        ]
      : []),
    oidc.tokenRevocation(config, decryptCredential(row.accessToken), {
      token_type_hint: "access_token",
    }),
  ]);
  if (results.some((result) => result.status === "rejected"))
    throw new Error(
      "OAuth provider rejected or could not process token revocation",
    );
}

export async function processOAuthRevocation(pool: pg.Pool): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Revocation>(
      `SELECT * FROM aibot."OAuthRevocationQueue" WHERE "nextAttemptAt" <= now()
       ORDER BY "nextAttemptAt", id FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const row = rows[0];
    if (!row) {
      await client.query("COMMIT");
      return false;
    }
    try {
      await revoke(row);
      await client.query(
        'DELETE FROM aibot."OAuthRevocationQueue" WHERE id = $1',
        [row.id],
      );
    } catch {
      await client.query(
        `UPDATE aibot."OAuthRevocationQueue" SET attempts = attempts + 1,
         "nextAttemptAt" = now() + make_interval(secs => LEAST(86400, 60 * power(2, LEAST(attempts, 10)))::double precision)
         WHERE id = $1`,
        [row.id],
      );
      appLogger.error(
        `OAuth revocation failed for authentication ${row.authenticationId}; it will be retried`,
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function startOAuthRevocationWorker() {
  if (globalWorker.__oauthRevocationWorker) return;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      for (
        let count = 0;
        count < 100 && (await processOAuthRevocation(pool));
        count++
      );
    } catch (error) {
      appLogger.error("OAuth revocation queue processing failed", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), 10_000);
  timer.unref();
  globalWorker.__oauthRevocationWorker = { timer, pool };
  void run();
}
