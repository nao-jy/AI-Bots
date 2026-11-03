import { Resend } from "resend";
import type { EmailProvider, EmailVerificationMessage } from "./index";

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
        subject: "メールアドレスの確認",
        text: [
          `${name ? `${name} さん、` : ""}AI Bots のメールアドレスを確認してください。`,
          "",
          "次のリンクを24時間以内に開いてください。",
          verificationUrl,
        ].join("\n"),
      });
      if (error) throw new Error(`Resendでメールを送信できませんでした: ${error.message}`);
    },
  };
}