import nodeMailer, {
  type Mail,
  type SMTPSentMessageInfo,
  type SMTPTransportOptions,
} from "nodemailer";
import type {
  EmailProvider,
  EmailVerificationMessage,
  PasswordResetMessage,
} from "./index";
import { t } from "~/.server/i18n";
import { APP_NAME } from "~/const";

export class SMTPRelayEmailProvider implements EmailProvider {
  private transporter: Mail<SMTPSentMessageInfo, SMTPTransportOptions>;
  private sender: string;
  constructor(
    host: string,
    port: number,
    secure: boolean,
    user: string,
    pass: string,
    domainFrom: string,
  ) {
    this.sender = `${APP_NAME} <noreply@${domainFrom}>`;
    this.transporter = nodeMailer.createTransport({
      host,
      port,
      secure,
      requireTLS: secure ? undefined : true,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendVerificationEmail({
    to,
    name,
    verificationUrl,
  }: EmailVerificationMessage) {
    const { error } = await this.transporter.sendMail({
      from: this.sender,
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
  }
  async sendPasswordResetEmail({ to, name, resetUrl }: PasswordResetMessage) {
    const { error } = await this.transporter.sendMail({
      from: this.sender,
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
  }
}
