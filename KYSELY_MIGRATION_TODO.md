# Prisma から Kysely への移行 TODO

## 方針

- [x] Kysely と既存の `pg` を使い、依存と実行時コードを小さく保つ。Kysely は `0.29.8` に固定。
- [x] 稼働前で既存データは不要。Prisma の履歴からの更新やデータ移行を行わず、新規の空DB向けSQLベースラインを使う。
- [x] アプリのDBアクセスとトランザクション境界は `app/.server/repository/` に置く。接続設定、SQLマイグレーション、DB検証スクリプトは例外とする。

## スキーマとマイグレーション

- [x] PostgreSQL `aibot` スキーマの33テーブル、275カラム、配列、nullable、型、日時精度、制約、インデックスをSQLベースラインへ移す。
- [x] OAuth失効用の関数とトリガーを別SQLに移す。既存データ向けバックフィルは含めない。
- [x] SQLファイルを順に適用する小さなNode.jsランナーを追加する。適用履歴、トランザクション、advisory lockにより再実行と同時実行を制御する。
- [x] 新規DBの作成とマイグレーション実行手順をREADMEと本番Composeに反映する。
- [x] Prisma依存、設定、生成物、旧マイグレーション履歴を削除する。

## Kysely とリポジトリ

- [x] SQLスキーマに合わせたKyselyのDB型と接続を追加する。`pg` の型定義を明示的な開発依存にする。
- [x] `app-settings`、`session`、`users`、`authorization`、`groups`、`runtime-lookups`、`thread-oauth`、`providers`、`mcp-servers`、`list-pages`、`executions`、`adapters`、`agents`、`schedules`、`service-apis`、`sandboxes`、`rate-limits`、`oauth`、`bots` の各リポジトリをKyselyへ移す。
- [x] アプリからPrismaクライアントとPrisma型への参照を取り除く。
- [x] Prisma時代のDBモックをKysely用に更新する。

## 検証結果

- [x] `npm run typecheck` 成功。
- [x] `npm test` 成功（27ファイル、93テスト）。
- [x] `npm run build` 成功。
- [x] 一時PostgreSQL 16の空DBに両SQLを適用し、再実行時に適用済みとしてスキップすることを確認。
- [x] 一時DBの全33テーブル・275カラムを旧スキーマ契約と照合し、型、nullable、配列、日時精度の一致を確認。
- [x] OAuth失効トリガーの作成、cascade削除、再試行キューへの記録を一時DBで確認。
- [x] リポジトリ統合テストを一時DBで実行し、グループを含む認可、組織境界、レート制限の使用量取得、失敗トランザクションのロールバックを確認。

## 運用上の前提

- このベースラインは新しい空DB向け。Prismaで作成した既存DBをそのまま指定すると失敗する。旧データとPrismaの適用履歴は移行しない。
- 全リポジトリの全クエリを実データで網羅してはいない。今回の実DB確認はスキーマ全体、主要な認可・レート制限・トランザクション、OAuth失効を対象とし、その他の機能テストはKysely用モックで実施した。
