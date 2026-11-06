import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { randomUUID } from "node:crypto";
import type { CodecTypes } from "../../src/prisma/contract";
import type { EntityRecord } from "../types/entities";
import { type TranslationMessage } from "../i18n";

export const jsonb = (value: unknown) =>
  value as CodecTypes["pg/jsonb@1"]["input"];

export function jsonbToStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("ja-JP");
}

export function idList(value: string | null) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)),
    ),
  ];
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function generateResourceId() {
  return randomUUID();
}

export function record(
  id: number | string,
  updatedAt: string | Date,
  fields: Record<string, string | number | boolean>,
): EntityRecord {
  return { id: String(id), updated: timestamp(updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt), ...fields };
}

export function encryptCredential(credential: string) {
  const keyValue = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyValue)
    throw new Error("server.credentialsEncryptionKeyRequiredForEncrypt");
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32)
    throw new Error("server.credentialsEncryptionKeyInvalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(credential, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptCredential(value: string) {
  const keyValue = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyValue)
    throw new Error("server.credentialsEncryptionKeyRequiredForDecrypt");
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32)
    throw new Error("server.credentialsEncryptionKeyInvalid");
  const [ivValue, authTagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !authTagValue || ciphertextValue === undefined)
    throw new Error("server.savedCredentialsUnreadable");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptStringMap(values: Record<string, string>) {
  const encryptedValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(values))
    if (key.trim()) encryptedValues[key.trim()] = encryptCredential(value);
  return { version: 1, encryptedValues };
}

export function decryptEncryptedStringMap(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const envelope = value as {
    version?: number;
    encryptedValues?: Record<string, unknown>;
  };
  if (envelope.version !== 1 || !envelope.encryptedValues) return {};
  const decrypted: Record<string, string> = {};
  for (const [key, ciphertext] of Object.entries(envelope.encryptedValues))
    if (typeof ciphertext === "string")
      decrypted[key] = decryptCredential(ciphertext);
  return decrypted;
}

export function decryptAdapterEnvs(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const envs = value as {
    version?: number;
    encryptedValues?: Record<string, unknown>;
    credentialCiphertext?: unknown;
  };
  if (envs.version === 1) return decryptEncryptedStringMap(value);
  if (typeof envs.credentialCiphertext === "string")
    return { ACCESS_TOKEN: decryptCredential(envs.credentialCiphertext) };
  return {};
}

export function decryptMcpHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const recordValue = value as Record<string, unknown>;
  if (recordValue.version === 1 && "encryptedValues" in recordValue)
    return decryptEncryptedStringMap(value);
  return Object.fromEntries(
    Object.entries(recordValue).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export type ConnectionTestResult =
  | { ok: true; intent: "test"; message: string | TranslationMessage }
  | { ok: false; intent: "test"; error: string | TranslationMessage };

export function testSuccess(
  message: string | TranslationMessage,
): ConnectionTestResult {
  return { ok: true, intent: "test", message };
}

export function testFailure(
  error: string | TranslationMessage,
): ConnectionTestResult {
  return { ok: false, intent: "test", error };
}

export function parseStringMap(value: FormDataEntryValue | null) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "{}").trim() || "{}");
  } catch {
    throw new Error("server.invalidJson");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("server.expectedKeyValueObject");
  if (Object.values(parsed).some((item) => typeof item !== "string"))
    throw new Error("server.expectedStringValue");
  return parsed as Record<string, string>;
}

export function parseObject(value: FormDataEntryValue | null) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "{}").trim() || "{}");
  } catch {
    throw new Error("server.invalidJson");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("server.expectedObject");
  return parsed as Record<string, unknown>;
}

export function generatePublicId() {
  return randomBytes(16).toString("base64url");
}

export function parseStringList(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    throw new Error("server.expectedJsonArray");
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string"))
    throw new Error("server.expectedStringJsonArray");
  return [...new Set(parsed.map((item) => item.trim()).filter(Boolean))];
}

export function sign(payload: string) {
  const encoded = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!encoded) throw new Error("server.credentialsEncryptionKeyRequired");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32)
    throw new Error("server.credentialsEncryptionKeyInvalid");

  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
