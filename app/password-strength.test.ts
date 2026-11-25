import { describe, expect, it } from "vitest";
import { getPasswordStrength } from "./password-strength";
import { meetsPasswordPolicy } from "./.server/password-policy";

describe("password strength with a user identifier", () => {
  it("treats the email and its local part as predictable", () => {
    const localPart = "n8x7m2q4v9za";
    const email = `${localPart}@example.com`;
    expect(getPasswordStrength(localPart, "")).toBeGreaterThanOrEqual(2);
    expect(getPasswordStrength(localPart, email)).toBe(0);
    expect(getPasswordStrength(email, email)).toBe(0);
    expect(meetsPasswordPolicy(localPart, 2, email)).toBe(false);
  });

  it("accepts an unrelated strong password", () => {
    expect(meetsPasswordPolicy("n8x7m2q4v9za", 2, "user@example.com")).toBe(
      true,
    );
  });
});
