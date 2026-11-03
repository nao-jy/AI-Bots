import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { redirect } from "react-router";
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
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionToken(request: Request) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.slice(SESSION_COOKIE.length + 1) ?? null;
}

export function sessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const settings = await getAppSettings();
  const expiresAt = new Date(
    Date.now() +
      (settings.sessionDurationSeconds * 1000 || SESSION_TTL_MS),
  );
  await createSessionInner(hashSessionToken(token), userId, expiresAt);
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
