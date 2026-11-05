import { Resend } from "resend";
import type {
  EmailProvider,
  EmailVerificationMessage,
  PasswordResetMessage,
} from "./index";
import { t } from "~/.server/i18n";

export function createResendEmailProvider(apiKey: string): EmailProvider {
  const resend = new Resend(apiKey);
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "AI Bots <onboarding@resend.dev>";

  return {
    async sendVerificationEmail({
      to,
      name,
      verificationUrl,
    }: EmailVerificationMessage) {
      const { error } = await resend.emails.send({
        from,
        to,
        subject: t("server.emailVerificationSubject"),
        text: [
          t("server.emailVerificationBody", {
            0: name ? t("server.emailGreeting", { 0: name }) : "",
          }),
          "",
          t("server.emailVerificationLinkInstructions"),
          verificationUrl,
        ].join("\n"),
      });
      if (error)
        throw new Error(
          t("server.emailDeliveryFailed", { 0: error.message }),
        );
    },
    async sendPasswordResetEmail({
      to,
      name,
      resetUrl,
    }: PasswordResetMessage) {
      const { error } = await resend.emails.send({
        from,
        to,
        subject: t("server.passwordResetSubject"),
        text: [
          t("server.passwordResetBody", {
            0: name ? t("server.emailGreeting", { 0: name }) : "",
          }),
          "",
          t("server.passwordResetLinkInstructions"),
          resetUrl,
          "",
          t("server.unrequestedEmailNotice"),
        ].join("\n"),
      });
      if (error)
        throw new Error(
          t("server.emailDeliveryFailed", { 0: error.message }),
        );
    },
  };
}
