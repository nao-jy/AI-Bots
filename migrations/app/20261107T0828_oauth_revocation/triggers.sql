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
