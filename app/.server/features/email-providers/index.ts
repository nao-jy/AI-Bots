import { appLogger } from "~/.server/logger/app-logger";
import { SMTPRelayEmailProvider } from "./smtp-relay";

export type EmailVerificationMessage = {
  to: string;
  name: string | null;
  verificationUrl: string;
};

export type PasswordResetMessage = {
  to: string;
  name: string | null;
  resetUrl: string;
};

export interface EmailProvider {
  sendVerificationEmail(message: EmailVerificationMessage): Promise<void>;
  sendPasswordResetEmail(message: PasswordResetMessage): Promise<void>;
}

export function getEmailProvider(): EmailProvider | null {
  try {
    const host = process.env.SMTP_RELAY_HOST;
    const port = Number(process.env.SMTP_RELAY_PORT);
    const secure = process.env.SMTP_RELAY_SECURE?.toLowerCase() === "true";
    const user = process.env.SMTP_RELAY_USER;
    const pass = process.env.SMTP_RELAY_PASS;
    const domainFrom = process.env.SMTP_RELAY_DOMAIN_FROM;
    if (
      !host ||
      !user ||
      !pass ||
      !domainFrom ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      return null;
    }
    return new SMTPRelayEmailProvider(
      host,
      port,
      secure,
      user,
      pass,
      domainFrom,
    );
  } catch (error) {
    appLogger.error(error);
  }
  return null;
}
