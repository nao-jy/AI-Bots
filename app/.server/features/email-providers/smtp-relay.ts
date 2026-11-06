import nodeMailer from "nodemailer";
import type {
  EmailProvider,
  EmailVerificationMessage,
  PasswordResetMessage,
} from "./index";
import { t } from "~/.server/i18n";
import { APP_NAME } from "~/const";

export function createSMTPRelayEmailProvider(
  host: string,
  port: number,
  secure: boolean,
  user: string,
  pass: string,
  domainFrom: string,
): EmailProvider {
  const from = `${APP_NAME} <noreply@${domainFrom}>`;
  const transporter = nodeMailer.createTransport({
    host,
    port,
    secure,
    requireTLS: secure ? undefined : true,
    auth: {
      user,
      pass,
    },
  });
  return {
    async sendVerificationEmail({
      to,
      name,
      verificationUrl,
    }: EmailVerificationMessage) {
      const { error } = await transporter.sendMail({
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
        throw new Error(t("server.emailDeliveryFailed", { 0: error.message }));
    },
    async sendPasswordResetEmail({ to, name, resetUrl }: PasswordResetMessage) {
      const { error } = await transporter.sendMail({
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
        throw new Error(t("server.emailDeliveryFailed", { 0: error.message }));
    },
  };
}
