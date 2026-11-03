import { createResendEmailProvider } from "./resend";

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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return apiKey ? createResendEmailProvider(apiKey) : null;
}