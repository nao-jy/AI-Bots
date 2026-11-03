# AI Bots

**AI Bots** は、AIチャットボットとその連携サービスを設定するためのWebワークスペースです。チャットプラットフォームを接続し、AIモデルを選択し、ツールやMCPサーバーを追加できます。管理されたサンドボックスでコードを実行したり、チャットスレッドにプロンプトを定期実行したりできます。

[English](./README.md)

## 主な機能

- **チャットボット:** 指示プロンプト、失敗時メッセージ、会話履歴、稼働状態、利用するサービスを設定できます。パブリックIDの確認・再生成や、アダプタごとのWebhook URLの確認・コピーにも対応します。
- **チャットアダプタ:** Slack、Microsoft Teams、Google Chat、Discord、X、LINEに接続できます。プラットフォーム固有の設定、OAuth認証情報の紐付け、接続テストを行えます。
- **AIプロバイダーとエージェント:** OpenAI、Azure OpenAI、Anthropic、OpenAI互換プロバイダーを設定し、モデルIDとモデルオプションを指定したエージェントを作成できます。ボットに割り当てる前にエージェントをテストできます。
- **ツールとファイル:** チャット・添付ファイル用ツール、Google Drive、OpenDAL対応のリモートファイルストレージ、King of Timeの勤怠データをボットに利用させることができます。利用可能なツールは、ボットの設定と接続済みの認証情報によって異なります。
- **MCPサーバー:** MCPエンドポイントとHTTPヘッダーを設定し、接続テストを行って、ボットから利用できるようにできます。
- **サンドボックス:** E2BまたはOpenSandboxの実行環境を設定できます。環境変数、許可するネットワークドメイン、初期化コマンド、共有範囲を管理できます。永続インスタンスの確認や内蔵ターミナルの利用にも対応します。
- **スケジュール実行:** 5フィールドまたは6フィールドのCron式とIANAタイムゾーンを指定し、選択したボット／アダプタのスレッドでプロンプトを実行できます。スケジュールの変更は実行中のスケジューラーに反映されます。
- **OAuthとユーザー:** OAuthクライアントを管理し、連携サービスのアカウントを認証できます。ログインページから最初に登録したユーザーは管理者になります。ユーザーアカウントの管理と管理者権限の付与・解除は管理者のみが行え、管理者は常に1人以上必要です。

## 動作要件

- Node.js 24 以降
- PostgreSQL 15 以降
- npm

同梱のCompose設定ではPostgreSQL 16を使用します。オプションの連携先としてSearXNGとOpenSandboxも定義されています。

## セットアップ

1. 依存関係をインストールします。

   ```bash
   npm ci
   ```

2. リポジトリのルートに `.env` を作成し、データベースURLと暗号化キーを設定します。

   ```dotenv
   DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
   CREDENTIALS_ENCRYPTION_KEY="<base64でエンコードした32バイトのキー>"
   ```

   キーは次のコマンドで生成できます。

   ```bash
   openssl rand -base64 32
   ```

   キーは秘密情報として安全に保管し、継続して同じ値を使用してください。保存済み認証情報の暗号化に使われるため、変更すると既存の暗号化済み認証情報を復号できなくなります。

3. PostgreSQLを起動します。同梱のComposeサービスを使う場合:

   ```bash
   docker compose --env-file .env -f infra/compose.yaml up -d postgres
   ```

   データベースが正常起動したことを確認し、初回のみテーブルを初期化します。

   ```bash
   npx prisma db init
   ```

4. アプリを起動します。

   ```bash
   npm run dev:app
   ```

   `http://localhost:5173` を開き、初回アクセス時に最初のユーザーアカウントを作成します。`npm run dev` はアプリに加えて、`CLOUDFLARE_TOKEN` が設定されている場合にCloudflare Tunnelも起動します。Tunnelを使わないローカル開発には `npm run dev:app` を使用してください。

## 環境変数

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 必須 | アプリとチャット状態ストアが使用するPostgreSQL接続文字列。 |
| `CREDENTIALS_ENCRYPTION_KEY` | 必須 | 認証情報の暗号化とOAuth認可状態の署名に使用する、Base64形式の32バイトキー。 |
| `OAUTH_BASE_URL` | OAuth利用時 | OAuthコールバックURL `/oauth/callback` の生成に使う公開HTTPSオリジン（パスなし）。ローカル開発では `http://localhost` も使用できます。生成されたコールバックURLをOAuthプロバイダーに登録してください。 |
| `PUBLIC_APP_URL` | 任意 | Webhook URL生成に使う公開アプリURL。未設定時はリクエストのオリジンを使用します。 |
| `E2B_API_KEY` | 任意 | E2Bサンドボックスプロバイダーを有効にします。 |
| `OPEN_SANDBOX_DOMAIN` | 任意 | OpenSandboxを有効にし、接続先ドメインを指定します。 |
| `OPEN_SANDBOX_API_KEY` | 任意 | 同梱Compose設定でOpenSandboxサーバーに渡すAPIキー。 |
| `SEARXNG_URL` | 任意 | Web検索ツールが使用するSearXNGのエンドポイント。 |
| `CLOUDFLARE_TOKEN` | 任意 | `npm run dev` で使用するCloudflare Tunnelのトークン。 |
| `LOG_DIR` | 任意 | ログ出力先。既定値は `logs`。 |

`infra/compose.yaml` にはPostgreSQL、SearXNG、OpenSandboxが定義されています。オプションのサービスも起動する場合は、`infra/.env` があることを確認してください（必要であれば `infra/sample.env` をコピーします）。

```bash
docker compose --env-file .env -f infra/compose.yaml up -d
```

各連携サービスの認証情報や設定はワークスペース上で設定してください。サンドボックスプロバイダーは、対応する環境変数を設定するとUIに表示されます。

## ビルドと起動

```bash
npm run typecheck
npm run build
npm run start
```

本番サーバーにも同じ環境変数が必要です。また、初期化済みで到達可能なPostgreSQLデータベースが必要です。

### Docker

本番用イメージをビルドして起動します。

```bash
docker build -t ai-bots .
docker run --env-file .env -p 3000:3000 ai-bots
```

コンテナに本番用の `DATABASE_URL`、`CREDENTIALS_ENCRYPTION_KEY` と、利用する連携サービス固有の設定を渡してください。公開環境ではHTTPSを使用し、OAuthを利用する場合は `OAUTH_BASE_URL` に公開オリジンを設定してください。
