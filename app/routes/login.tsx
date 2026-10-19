import { useState } from "react";
import {
  Anchor,
  Button,
  Checkbox,
  PasswordInput,
  Text,
  TextInput,
} from "@mantine/core";
import { Link, useNavigate } from "react-router";
import { APP_NAME } from "~/const";

export function meta() {
  return [
    { title: `ログイン | ${APP_NAME}` },
    { name: "description", content: `${APP_NAME} ワークスペースにログイン` },
  ];
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("メールアドレスとパスワードを入力してください。");
      return;
    }
    navigate("/");
  }

  return (
    <main className="login-page">
      <div className="login-decoration decor-one" />
      <div className="login-decoration decor-two" />
      <div className="login-decoration decor-three" />
      <div className="login-top">
        <Link to="/" className="brand">
          <span className="brand-mark">✳</span>
          <span>
            {APP_NAME}
            <span className="brand-dot">.</span>
            <small>AI WORKSPACE</small>
          </span>
        </Link>
      </div>
      <div className="login-card-wrap">
        <section className="login-card">
          <div className="login-welcome-mark">✳</div>
          <div className="eyebrow">YOUR AI WORKSPACE</div>
          <h1>おかえりなさい</h1>
          <p className="login-subtitle">
            アカウントにログインして、ワークスペースを開きましょう。
          </p>
          <form onSubmit={submit} className="login-form">
            <TextInput
              label="メールアドレス"
              placeholder="name@company.com"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <PasswordInput
              label="パスワード"
              placeholder="パスワードを入力"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <div className="login-options">
              <Checkbox label="ログイン状態を保持する" />
              <Anchor href="#forgot">パスワードをお忘れですか？</Anchor>
            </div>
            {error && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}
            <Button type="submit" fullWidth>
              ログイン <span>→</span>
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
