import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { redirect } from "react-router";
import { clearCookie, getCookieValue, serializeCookie } from "../cookie";
import {
  expireSessionByToken,
  getSessionUser as getSessionUserInner,
  createSession as createSessionInner,
} from "./repository/session";
import { getAppSettings } from "./repository/app-settings";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "bot_manager_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  organizationId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionToken(request: Request) {
  return getCookieValue(request.headers.get("Cookie"), SESSION_COOKIE);
}

export function sessionCookie(token: string, expiresAt: Date) {
  return serializeCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    expires: expiresAt,
  });
}

export function clearSessionCookie() {
  return clearCookie(SESSION_COOKIE, { httpOnly: true });
}

export async function createSession(userId: string, organizationId: string) {
  const token = randomBytes(32).toString("base64url");
  const settings = await getAppSettings(organizationId);
  const expiresAt = new Date(
    Date.now() + (settings.sessionDurationSeconds * 1000 || SESSION_TTL_MS),
  );
  await createSessionInner(
    hashSessionToken(token),
    userId,
    expiresAt,
    organizationId,
  );
  return { token, expiresAt };
}

export async function deleteSession(request: Request) {
  const token = getSessionToken(request);
  if (!token) return;
  await expireSessionByToken(hashSessionToken(token));
}

export async function getSessionUser(
  request: Request,
): Promise<AuthUser | null> {
  const token = getSessionToken(request);
  if (!token) return null;

  const session = await getSessionUserInner(hashSessionToken(token));
  if (!session) return null;
  if (!session.mfaVerified) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) return null;

  return {
    id: session.user.id,
    organizationId: session.user.organizationId,
    email: session.user.email,
    name: session.user.name,
    isAdmin: session.user.isAdmin,
  };
}

export async function requireUser(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw redirect("/login");
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (!user.isAdmin) throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltHex, keyHex] = storedHash.split(":");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
  )) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
