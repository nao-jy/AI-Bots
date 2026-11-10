import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptAdapterEnvs,
  decryptCredential,
  decryptEncryptedStringMap,
  decryptMcpContext,
  decryptMcpHeaders,
  encryptCredential,
  encryptStringMap,
  idList,
  isUuid,
  jsonbToStringRecord,
  parseObject,
  parseStringList,
  parseStringMap,
  sign,
} from "./utils";

const key = Buffer.alloc(32, 42).toString("base64");

afterEach(() => vi.unstubAllEnvs());

describe("credential encryption", () => {
  it("round-trips Unicode and empty credentials with a fresh IV each time", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", key);
    for (const value of ["", "秘密🔑\nvalue"]) {
      const first = encryptCredential(value);
      const second = encryptCredential(value);
      expect(first).not.toBe(second);
      expect(first).not.toContain(value || "秘密");
      expect(decryptCredential(first)).toBe(value);
      expect(decryptCredential(second)).toBe(value);
    }
  });

  it("rejects tampered ciphertext and a different key", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", key);
    const encrypted = encryptCredential("secret");
    const [iv, tag, ciphertext] = encrypted.split(".");
    const bytes = Buffer.from(ciphertext, "base64url");
    bytes[0] ^= 1;
    expect(() =>
      decryptCredential(`${iv}.${tag}.${bytes.toString("base64url")}`),
    ).toThrow();
    vi.stubEnv(
      "CREDENTIALS_ENCRYPTION_KEY",
      Buffer.alloc(32, 43).toString("base64"),
    );
    expect(() => decryptCredential(encrypted)).toThrow();
  });

  it("requires a valid encryption key and a readable envelope", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "");
    expect(() => encryptCredential("secret")).toThrow(
      "server.credentialsEncryptionKeyRequiredForEncrypt",
    );
    expect(() => decryptCredential("value")).toThrow(
      "server.credentialsEncryptionKeyRequiredForDecrypt",
    );
    expect(() => sign("value")).toThrow(
      "server.credentialsEncryptionKeyRequired",
    );
    vi.stubEnv(
      "CREDENTIALS_ENCRYPTION_KEY",
      Buffer.alloc(31).toString("base64"),
    );
    expect(() => encryptCredential("secret")).toThrow(
      "server.credentialsEncryptionKeyInvalid",
    );
    expect(() => decryptCredential("value")).toThrow(
      "server.credentialsEncryptionKeyInvalid",
    );
    expect(() => sign("value")).toThrow(
      "server.credentialsEncryptionKeyInvalid",
    );
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", key);
    expect(() => decryptCredential("missing.parts")).toThrow(
      "server.savedCredentialsUnreadable",
    );
  });

  it("reads encrypted maps and legacy adapter and MCP formats", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", key);
    const envelope = encryptStringMap({
      " TOKEN ": "abc",
      " ": "ignored",
      EMPTY: "",
    });
    expect(decryptEncryptedStringMap(envelope)).toEqual({
      TOKEN: "abc",
      EMPTY: "",
    });
    expect(decryptAdapterEnvs(envelope)).toEqual({ TOKEN: "abc", EMPTY: "" });
    expect(decryptMcpHeaders(envelope)).toEqual({ TOKEN: "abc", EMPTY: "" });
    expect(
      decryptAdapterEnvs({ credentialCiphertext: encryptCredential("old") }),
    ).toEqual({ ACCESS_TOKEN: "old" });
    expect(
      decryptMcpHeaders({ Authorization: "Bearer token", invalid: 123 }),
    ).toEqual({ Authorization: "Bearer token" });
    expect(
      decryptEncryptedStringMap({ version: 2, encryptedValues: {} }),
    ).toEqual({});
    expect(
      decryptEncryptedStringMap({
        version: 1,
        encryptedValues: { invalid: 42 },
      }),
    ).toEqual({});
  });

  it("keeps MCP context encrypted separately from HTTP headers", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", key);
    const envelope = {
      ...encryptStringMap({ "X-Test": "value" }),
      contextCiphertext: encryptCredential(JSON.stringify({ apiKey: "secret" })),
    };
    expect(JSON.stringify(envelope)).not.toContain("secret");
    expect(decryptMcpHeaders(envelope)).toEqual({ "X-Test": "value" });
    expect(decryptMcpContext(envelope)).toEqual({ apiKey: "secret" });
    expect(decryptMcpContext(encryptStringMap({}))).toEqual({});
  });
});

describe("input parsing", () => {
  it("validates UUID variants and normalizes comma-separated lists", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(isUuid(id)).toBe(true);
    expect(isUuid(id.toUpperCase())).toBe(true);
    expect(isUuid("123e4567-e89b-02d3-a456-426614174000")).toBe(false);
    expect(isUuid("123e4567-e89b-42d3-7456-426614174000")).toBe(false);
    expect(idList(` ${id}, invalid,${id}, `)).toEqual([id]);
    expect(idList(null)).toEqual([]);
  });

  it("parses objects and rejects invalid JSON and incorrect shapes", () => {
    expect(parseObject(null)).toEqual({});
    expect(parseObject('{"nested":[1],"enabled":true}')).toEqual({
      nested: [1],
      enabled: true,
    });
    expect(parseStringMap(' {"key":"value"} ')).toEqual({ key: "value" });
    for (const parse of [parseObject, parseStringMap]) {
      expect(() => parse("{")).toThrow("server.invalidJson");
    }
    for (const value of ["null", "[]", '"text"']) {
      expect(() => parseObject(value)).toThrow("server.expectedObject");
      expect(() => parseStringMap(value)).toThrow(
        "server.expectedKeyValueObject",
      );
    }
    expect(() => parseStringMap('{"key":1}')).toThrow(
      "server.expectedStringValue",
    );
  });

  it("trims, deduplicates and validates string lists", () => {
    expect(parseStringList("")).toEqual([]);
    expect(parseStringList('[" a ","a","", " b"]')).toEqual(["a", "b"]);
    expect(() => parseStringList("[")).toThrow("server.expectedJsonArray");
    expect(() => parseStringList('["a", 1]')).toThrow(
      "server.expectedStringJsonArray",
    );
    expect(() => parseStringList("{} ")).toThrow(
      "server.expectedStringJsonArray",
    );
  });

  it("retains only string values in JSON records", () => {
    expect(jsonbToStringRecord({ a: "", b: "text", c: null, d: 1 })).toEqual({
      a: "",
      b: "text",
    });
    for (const value of [null, [], "text", 3])
      expect(jsonbToStringRecord(value)).toEqual({});
  });
});
