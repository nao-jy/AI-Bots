import { getPasswordStrength } from "../password-strength";

export function meetsPasswordPolicy(password: string, minimumStrength: number) {
  return password.length > 0 && getPasswordStrength(password) >= minimumStrength;
}
