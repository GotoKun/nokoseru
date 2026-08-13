# ノコセル（AI HACK 2026）

AIが高齢者にインタビューを行い、映像で記録し、指定した節目で家族に配信する終活サポートアプリ。
設計の背景・意思決定は `../nokoseru_planning.md` / `../nokoseru_design.md` / `../research_report.md`（プロジェクトルート）を参照。

## セットアップ（初回のみ）

### 1. 必要なもの

| ツール | 用途 | 確認コマンド |
| :---- | :---- | :---- |
| Node.js（v20以上推奨） | アプリ本体 | `node -v` |
| ffmpeg | 収録音声をSTT用にwav変換するために必須（後述） | `ffmpeg -version` |

ffmpegが無いとインストールする（Macの場合、[Homebrew](https://brew.sh/ja/)が入っていれば1コマンド）。

```bash
brew install ffmpeg
```

Windows/Linuxの場合は [ffmpeg公式](https://ffmpeg.org/download.html) の手順に従ってインストールする。

### 2. リポジトリ取得・依存パッケージのインストール

```bash
cd nokoseru-web
npm install
```

### 3. データベース作成

```bash
npx prisma migrate deploy
```

`prisma/dev.db`（SQLite）が作成される。以後、スキーマを変更しない限り再実行不要。

### 4. 環境変数の設定

```bash
cp .env.example .env
```

`.env`を開いて`ORCAROUTER_API_KEY`にキーを設定する（キーの取得方法は下記「OrcaRouterとダミーモード」参照）。
`DATABASE_URL`と`ORCAROUTER_BASE_URL`はデフォルトのままでよい。

### 5. 起動

```bash
npm run dev
```

http://localhost:3000 を開く。`.env`を書き換えたときは`npm run dev`の再起動が必要（起動時に一度だけ読み込むため）。

## OrcaRouterとダミーモード

### APIキーの取得

1. バウチャー付きURL（`https://www.orcarouter.ai/redeem/AI-HACK-2026-ORCAROUTER`）からダッシュボードに入る
2. キーを発行する（`sk-orca-`で始まる文字列）
3. `.env`の`ORCAROUTER_API_KEY=`の右側に貼り付け、`npm run dev`を再起動する

### キーが無くても動く（ダミーモード）

`.env` の `ORCAROUTER_API_KEY` が未設定の場合、`lib/orcarouter.ts` は文字起こし・構造化・質問生成・
写真カラー化のすべてをダミーの固定ロジックで返す（実際のAPI呼び出しは行わない）。
これにより、キーがなくても収録→構造化→カバレッジ更新→検索→エクスポートの一連の流れを最初から最後まで確認できる。

実際のLLM/STT/画像編集を使うには `ORCAROUTER_API_KEY` を設定するだけでよい（コード変更不要）。

## 困ったときは

| 症状 | 原因・対処 |
| :---- | :---- |
| 収録画面でカメラ映像が真っ暗 | 過去に一度あった描画タイミングのバグ（修正済み）。直らない場合はブラウザのカメラ権限を確認 |
| 収録停止後に「収録データの処理に失敗しました」 | 実キー使用時、ffmpegが未インストールだとここで失敗する（`ffmpegが見つかりません`とターミナルに出る）。上記「必要なもの」の手順でインストールし、`npm run dev`を再起動 |
| 検索・再生画面で動画が途中で止まる／後半が乱れる | 過去に一度あったバグ（修正済み）。ChromeのMediaRecorderが書き出すwebmは長さ情報を持たないため、アップロード時にffmpegでコンテナを書き直す（`lib/media.ts`の`remuxForSeeking`）ようにした。ffmpeg未インストールだと書き直しがスキップされ症状が再発するので、その場合もffmpegをインストールする |
| 検索・再生画面で「話している場面」より数秒手前が再生される | 過去に一度あったバグ（修正済み）。マイクの起動遅延で音声トラックの開始時刻がずれる問題を、STTのタイムスタンプ側で補正するようにした |
| `.env`を書き換えたのに反映されない | Next.jsは起動時にしか`.env`を読み込まない。`npm run dev`を再起動する |
| iOS Safariで録画できない | カメラ非対応の場合は音声のみに自動で切り替わる仕様（design 12.2節）。それでも失敗する場合はブラウザのマイク権限を確認 |

## 構成

- `prisma/schema.prisma` — データモデル（Person / Session / Utterance / Episode / Coverage / Delivery / Photo）
- `lib/orcarouter.ts` — OrcaRouter経由のLLM/STT/画像編集呼び出し（モデル選定は design 4.4節準拠）
- `lib/media.ts` — ffmpegによる音声抽出（STT用）・動画コンテナの修復（再生・シーク安定化用）
- `lib/data.ts` — 収録・構造化・カバレッジ計算・検索・写真処理のドメインロジック
- `lib/export.ts` / `lib/viewer-template.ts` — エクスポートzip生成（動画+SRT+data.json+自己完結viewer.html）
- `storage/` — 収録動画・写真・エクスポートzipのローカル保存先（gitignore対象。本番はS3等に差し替え想定）
- `app/persons/[personId]/` — 収録・カバレッジ閲覧・検索/再生・写真・エクスポートの各画面

## 実装していないもの（意図的にスコープ外）

認証・暗号化・通知・家族横断の齟齬検出は `nokoseru_design.md` 1章の方針どおりスコープ外。
