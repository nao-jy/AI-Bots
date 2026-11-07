import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider } from "./index";

const smtpEnv = {
  SMTP_RELAY_HOST: "smtp.example.com",
  SMTP_RELAY_PORT: "465",
  SMTP_RELAY_SECURE: "true",
  SMTP_RELAY_USER: "user",
  SMTP_RELAY_PASS: "password",
  SMTP_RELAY_DOMAIN_FROM: "example.com",
};

afterEach(() => vi.unstubAllEnvs());

describe("SMTP configuration", () => {
  it("disables email when any required field is missing or the port is invalid", () => {
    for (const [key, value] of Object.entries(smtpEnv)) vi.stubEnv(key, value);
    for (const key of [
      "SMTP_RELAY_HOST",
      "SMTP_RELAY_USER",
      "SMTP_RELAY_PASS",
      "SMTP_RELAY_DOMAIN_FROM",
    ]) {
      vi.stubEnv(key, "");
      expect(getEmailProvider()).toBeNull();
      vi.stubEnv(key, smtpEnv[key as keyof typeof smtpEnv]);
    }
    for (const port of ["", "0", "65536", "not-a-port"]) {
      vi.stubEnv("SMTP_RELAY_PORT", port);
      expect(getEmailProvider()).toBeNull();
    }
  });

  it("enables email when the required settings are present", () => {
    for (const [key, value] of Object.entries(smtpEnv)) vi.stubEnv(key, value);
    expect(getEmailProvider()).not.toBeNull();
  });
});
