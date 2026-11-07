type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none" | boolean;
  secure?: boolean;
};

/** Read one cookie value from a Cookie header or document.cookie string. */
export function getCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  const entry = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;

  const value = entry.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Serialize a cookie with the application's shared defaults. */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
) {
  const settings = {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...options,
  } satisfies CookieOptions;
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (settings.domain) parts.push(`Domain=${settings.domain}`);
  if (settings.path) parts.push(`Path=${settings.path}`);
  if (settings.expires) parts.push(`Expires=${settings.expires.toUTCString()}`);
  if (settings.maxAge !== undefined)
    parts.push(`Max-Age=${Math.trunc(settings.maxAge)}`);
  if (settings.httpOnly) parts.push("HttpOnly");
  if (settings.secure) parts.push("Secure");
  if (settings.sameSite === true) parts.push("SameSite=Strict");
  else if (settings.sameSite)
    parts.push(
      `SameSite=${settings.sameSite[0].toUpperCase()}${settings.sameSite.slice(1)}`,
    );
  return parts.join("; ");
}

export function clearCookie(name: string, options: CookieOptions = {}) {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

/** Append each Set-Cookie value separately so browsers receive every cookie. */
export function appendSetCookies(headers: Headers, ...cookies: string[]) {
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return headers;
}
