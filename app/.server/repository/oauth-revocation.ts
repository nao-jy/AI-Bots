import type pg from "pg";

export type OAuthRevocationJob = {
  id: string;
  authenticationId: string;
  clientId: string;
  clientSecret: string | null;
  revocationEndpoint: string | null;
  accessToken: string;
  refreshToken: string | null;
};

export async function processOAuthRevocationJob(
  pool: pg.Pool,
  revoke: (job: OAuthRevocationJob) => Promise<void>,
  onFailure: (job: OAuthRevocationJob) => void,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<OAuthRevocationJob>(
      `SELECT * FROM aibot."OAuthRevocationQueue" WHERE "nextAttemptAt" <= now()
       ORDER BY "nextAttemptAt", id FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const job = rows[0];
    if (!job) {
      await client.query("COMMIT");
      return false;
    }
    try {
      await revoke(job);
      await client.query('DELETE FROM aibot."OAuthRevocationQueue" WHERE id = $1', [job.id]);
    } catch {
      await client.query(
        `UPDATE aibot."OAuthRevocationQueue" SET attempts = attempts + 1,
         "nextAttemptAt" = now() + make_interval(secs => LEAST(86400, 60 * power(2, LEAST(attempts, 10)))::double precision)
         WHERE id = $1`,
        [job.id],
      );
      onFailure(job);
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
