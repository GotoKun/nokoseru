# ノコセル

AIが高齢者にインタビューを行い、映像で記録し、指定した節目でご家族に届ける終活サポートアプリです。
AI HACK 2026（OrcaRouter協賛）向けに開発しました。

「その人の話が、そのまま残る。」— 生成AIは質問生成・構造化・未収録領域の検出にのみ使用し、
本人が話した音声・映像そのものには一切加工を加えません（詳細は下記ドキュメント参照）。

## リポジトリ構成

| パス | 内容 |
| :---- | :---- |
| [`nokoseru-web/`](./nokoseru-web) | 実装コード（Next.js + Prisma + OrcaRouter）。セットアップ手順は[`nokoseru-web/README.md`](./nokoseru-web/README.md)参照 |
| [`nokoseru_planning.md`](./nokoseru_planning.md) | 企画概要（課題定義・機能要件・設計方針・収益モデル） |
| [`nokoseru_design.md`](./nokoseru_design.md) | 実装設計書（技術スタック、OrcaRouter利用設計、データモデル、API設計） |
| [`research_report.md`](./research_report.md) | 市場・競合・倫理に関する調査レポート（出典付き） |
| [`CLAUDE.md`](./CLAUDE.md) | 検討経緯のまとめ |

## 技術スタック

Next.js（App Router）+ TypeScript + Prisma（SQLite）+ OrcaRouter（LLM/STT/画像編集）。
モデル選定・ルーティング方針は[`nokoseru_design.md`](./nokoseru_design.md)の4章を参照してください。

## セットアップ

実行方法は[`nokoseru-web/README.md`](./nokoseru-web/README.md)にまとめています。
