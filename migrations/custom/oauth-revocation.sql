-- Run as one transaction while writers are excluded, including during backfill.
LOCK TABLE aibot."OAuthClient", aibot."OAuthAuthentication" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS aibot."OAuthRevocationSnapshot" (
  "authenticationId" uuid PRIMARY KEY,
  "oauthId" uuid NOT NULL,
  "clientId" text NOT NULL,
  "clientSecret" text,
  "revocationEndpoint" text
);
CREATE INDEX IF NOT EXISTS "OAuthRevocationSnapshot_oauthId_idx"
  ON aibot."OAuthRevocationSnapshot" ("oauthId");

CREATE TABLE IF NOT EXISTS aibot."OAuthRevocationQueue" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "authenticationId" uuid NOT NULL,
  "clientId" text NOT NULL,
  "clientSecret" text,
  "revocationEndpoint" text,
  "accessToken" text NOT NULL,
  "refreshToken" text,
  attempts integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "OAuthRevocationQueue_nextAttemptAt_idx"
  ON aibot."OAuthRevocationQueue" ("nextAttemptAt", id);

CREATE OR REPLACE FUNCTION aibot.oauth_revocation_snapshot_auth() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO aibot."OAuthRevocationSnapshot"
    ("authenticationId", "oauthId", "clientId", "clientSecret", "revocationEndpoint")
  SELECT NEW.id, c.id, c."clientId", c."clientSecret", c."revocationEndpoint"
    FROM aibot."OAuthClient" c WHERE c.id = NEW."oauthId" FOR SHARE
  ON CONFLICT ("authenticationId") DO UPDATE SET
    "oauthId" = EXCLUDED."oauthId", "clientId" = EXCLUDED."clientId",
    "clientSecret" = EXCLUDED."clientSecret", "revocationEndpoint" = EXCLUDED."revocationEndpoint";
  IF NOT FOUND THEN RAISE EXCEPTION 'OAuth client missing for authentication %', NEW.id; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION aibot.oauth_revocation_snapshot_client() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE aibot."OAuthRevocationSnapshot" SET
    "clientId" = NEW."clientId", "clientSecret" = NEW."clientSecret",
    "revocationEndpoint" = NEW."revocationEndpoint"
  WHERE "oauthId" = NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION aibot.oauth_revocation_enqueue() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO aibot."OAuthRevocationQueue"
    ("authenticationId", "clientId", "clientSecret", "revocationEndpoint", "accessToken", "refreshToken")
  SELECT OLD.id, s."clientId", s."clientSecret", s."revocationEndpoint", OLD."accessToken", OLD."refreshToken"
    FROM aibot."OAuthRevocationSnapshot" s WHERE s."authenticationId" = OLD.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OAuth revocation snapshot missing for authentication %', OLD.id; END IF;
  DELETE FROM aibot."OAuthRevocationSnapshot" WHERE "authenticationId" = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS oauth_revocation_snapshot_auth ON aibot."OAuthAuthentication";
CREATE TRIGGER oauth_revocation_snapshot_auth AFTER INSERT OR UPDATE OF "oauthId" ON aibot."OAuthAuthentication"
  FOR EACH ROW EXECUTE FUNCTION aibot.oauth_revocation_snapshot_auth();
DROP TRIGGER IF EXISTS oauth_revocation_snapshot_client ON aibot."OAuthClient";
CREATE TRIGGER oauth_revocation_snapshot_client AFTER UPDATE OF "clientId", "clientSecret", "revocationEndpoint" ON aibot."OAuthClient"
  FOR EACH ROW EXECUTE FUNCTION aibot.oauth_revocation_snapshot_client();
DROP TRIGGER IF EXISTS oauth_revocation_enqueue ON aibot."OAuthAuthentication";
CREATE TRIGGER oauth_revocation_enqueue BEFORE DELETE ON aibot."OAuthAuthentication"
  FOR EACH ROW EXECUTE FUNCTION aibot.oauth_revocation_enqueue();

INSERT INTO aibot."OAuthRevocationSnapshot"
  ("authenticationId", "oauthId", "clientId", "clientSecret", "revocationEndpoint")
SELECT a.id, c.id, c."clientId", c."clientSecret", c."revocationEndpoint"
FROM aibot."OAuthAuthentication" a JOIN aibot."OAuthClient" c ON c.id = a."oauthId"
ON CONFLICT ("authenticationId") DO UPDATE SET
  "oauthId" = EXCLUDED."oauthId", "clientId" = EXCLUDED."clientId",
  "clientSecret" = EXCLUDED."clientSecret", "revocationEndpoint" = EXCLUDED."revocationEndpoint";
