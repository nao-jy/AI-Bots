import { Resend } from "resend";
import type {
  EmailProvider,
  EmailVerificationMessage,
  PasswordResetMessage,
} from "./index";

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
      if (error)
        throw new Error(
          `Resendでメールを送信できませんでした: ${error.message}`,
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
        subject: "パスワードの再設定",
        text: [
          `${name ? `${name} さん、` : ""}パスワードの再設定がリクエストされました。`,
          "",
          "次のリンクから1時間以内に新しいパスワードを設定してください。",
          resetUrl,
          "",
          "このメールに心当たりがない場合は、何も操作する必要はありません。",
        ].join("\n"),
      });
      if (error)
        throw new Error(
          `Resendでメールを送信できませんでした: ${error.message}`,
        );
    },
  };
}