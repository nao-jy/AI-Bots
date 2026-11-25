import { getPasswordStrength } from "../password-strength";

export function meetsPasswordPolicy(
  password: string,
  minimumStrength: number,
  userId: string,
) {
  return (
    password.length > 0 &&
    getPasswordStrength(password, userId) >= minimumStrength
  );
}
