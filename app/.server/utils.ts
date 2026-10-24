import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CodecTypes } from "../../src/prisma/contract";
import type { EntityRecord } from "../types/entities";

export const jsonb = (value: unknown) =>
  value as CodecTypes["pg/jsonb@1"]["input"];

export function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("ja-JP");
}

export function idList(value: string | null) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .filter((item) => item.trim() !== "")
        .map(Number)
        .filter(Number.isInteger),
    ),
  ];
}

export function record(
  id: number,
  updatedAt: string,
  fields: Record<string, string | number>,
): EntityRecord {
  return { id, updated: timestamp(updatedAt), ...fields };
}

export function encryptCredential(credential: string) {
  const keyValue = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyValue)
    throw new Error(
      "認証情報を暗号化するには CREDENTIALS_ENCRYPTION_KEY を設定してください。",
    );
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32)
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY は32バイトのbase64値にしてください。",
    );
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
    throw new Error(
      "認証情報を復号するには CREDENTIALS_ENCRYPTION_KEY を設定してください。",
    );
  const key = Buffer.from(keyValue, "base64");
  if (key.length !== 32)
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY は32バイトのbase64値にしてください。",
    );
  const [ivValue, authTagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !authTagValue || ciphertextValue === undefined)
    throw new Error("保存された認証情報を読み込めません。");
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
  | { ok: true; intent: "test"; message: string }
  | { ok: false; intent: "test"; error: string };

export function testSuccess(message: string): ConnectionTestResult {
  return { ok: true, intent: "test", message };
}

export function testFailure(error: string): ConnectionTestResult {
  return { ok: false, intent: "test", error };
}

export function parseStringMap(
  value: FormDataEntryValue | null,
  label: string,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "{}").trim() || "{}");
  } catch {
    throw new Error(`${label}のJSON形式を確認してください。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${label}はキー・値のオブジェクトで入力してください。`);
  if (Object.values(parsed).some((item) => typeof item !== "string"))
    throw new Error(`${label}の値は文字列で入力してください。`);
  return parsed as Record<string, string>;
}

export function parseObject(value: FormDataEntryValue | null, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "{}").trim() || "{}");
  } catch {
    throw new Error(`${label}のJSON形式を確認してください。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${label}にはオブジェクトを入力してください。`);
  return parsed as Record<string, unknown>;
}

export function generatePublicId() {
  return randomBytes(16).toString("base64url");
}
