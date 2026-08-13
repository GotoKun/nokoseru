# ノコセル 設計書（ハッカソン実装版）

作成日：2026-08-13 ／ `nokoseru_planning.md`・`research_report.md`・CLAUDE.mdの決定事項を踏まえた実装仕様。Claude Codeでの実装着手を想定した引き継ぎ資料。

---

## 1. 実装スコープ（企画書13.1準拠）

位置づけ：本サービスは生前に本人が使う「終活サポートアプリ」。終活で何をすべきか・何を撮っておくべきかをアプリ側から提案し、動画をストックして、指定した節目（死後含む）に家族へ配信する。

| 優先 | 機能 |
| :---- | :---- |
| 必須 | 収録／構造化・カバレッジマップ／開示・再生／検索（未収録時の応答含む） |
| 任意（wow機能） | 字幕、無音スキップ、サムネイル選定、**写真カラー化＋写真ベース質問生成**（11章参照） |
| 対象外 | 認証、暗号化、通知、家族横断の齟齬検出（設計説明のみ） |

デモでは閲覧側の質問マッチングはキーワード・タグの単純一致に絞り、LLM呼び出しは収録側（質問生成・構造化）に集約する（CLAUDE.md「AIの役割の切り分け」参照）。

---

## 2. アーキテクチャ全体

```
[ブラウザ: 収録画面]
  MediaRecorder → チャンク逐次アップロード
        ↓
[サーバー: セッション確定処理]
  1. 音声をOrcaRouter経由でGemini(マルチモーダル)に送信 → 文字起こし＋タイムスタンプ取得
  2. 文字起こしをLLMに渡してエピソード分割・タグ付け（response_format=JSON schema）
  3. カバレッジマップ更新・未収録領域の再計算
        ↓
[DB] Session / Utterance / Episode / Coverage
        ↓
[配信・閲覧画面]
  質問入力 → キーワード・タグでEpisode検索 → 該当videoをcurrentTimeでシーク再生
        ↓
[エクスポート]
  video + SRT + JSON(タグ・エピソード) + 自己完結型HTMLビューアをまとめてダウンロード
```

**設計上の要点**：1セッション＝質問1件・3〜5分という制約（企画書6.1）により、音声ファイルは常に小さく、OrcaRouterへのインライン音声送信（後述）でサイズ上限に抵触しない。これは技術選定上、地味だが重要な前提。

---

## 3. 技術スタック（提案）

| レイヤ | 選定 | 理由 |
| :---- | :---- | :---- |
| フレームワーク | Next.js（App Router）+ TypeScript | フロント・API Routesを1リポジトリで完結、デモデプロイも容易 |
| DB | SQLite + Prisma | セットアップが最速。ハッカソン規模のデータ量なら十分 |
| 動画保存 | ローカルファイルシステム（`/storage/videos`） | 本番は3層ストレージ（温層→Glacier Deep Archive相当）だが、デモでは不要。S3互換に差し替え可能な形で抽象化しておく |
| 録画 | `MediaRecorder` API（`audio/webm` or 対応形式） | ブラウザ標準。iOS Safari対応は要実機検証（14章参照） |
| LLM/STT | OrcaRouter（`https://api.orcarouter.ai/v1`、OpenAI SDK互換） | レギュレーション上必須。詳細は4章 |

この構成に強いこだわりはないので、チームの得意な構成があれば差し替えてよい。

---

## 4. OrcaRouter利用設計（公式ドキュメント確認済み）

### 4.1 基本

- Base URL: `https://api.orcarouter.ai/v1`（OpenAI SDKの`base_url`を書き換えるだけ）
- モデル名はプロバイダ名前空間付き：`openai/gpt-4o-mini`、`anthropic/claude-sonnet-4.6`、`google/gemini-2.5-pro`など
- APIキーは `sk-orca-` で始まる（ダッシュボードから取得）

### 4.2 STT（文字起こし）— 別サービス不要

OrcaRouterに専用のSTTエンドポイントはないが、**Geminiのマルチモーダル音声入力**が`/v1/chat/completions`の`input_audio`パート経由で使える。音声をbase64化して送るだけで、Gemini 2.5 Flash等が直接文字起こしできる。

```json
{
  "model": "google/gemini-2.5-flash",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "この音声を文字起こしし、発話区間ごとのタイムスタンプ(秒)をJSONで出力してください。"},
      {"type": "input_audio", "input_audio": {"data": "<base64>", "format": "webm"}}
    ]
  }]
}
```

**注意**：インライン音声はサイズ上限が上流プロバイダ（Google）依存。長尺ファイルはFile API迂回が必要だが、1セッション3〜5分の設計なら問題にならない見込み（企画書14「STT実装方式」の未決事項はこれで解消できる）。

### 4.3 構造化・タグ付け

`response_format`でJSON Schemaを指定し、エピソード分割・タグ付けを安定した構造で受け取る（Structured Outputs機能）。

### 4.4 ルーティングモード

| 処理 | 推奨方式 | 理由 |
| :---- | :---- | :---- |
| 質問生成 | モデル明示指定（例: `anthropic/claude-sonnet-4.6`） | デモの再現性を優先。日によって出力が変わると審査で説明しづらい |
| 文字起こし | `google/gemini-2.5-flash`固定 | 音声入力対応がGeminiのみのため選択の余地がない |
| タグ付け・分類 | `orcarouter/auto`（balanced戦略）でも可 | 軽い定型タスクなのでコスト最適化を見せる材料になる |

`orcarouter/auto`を使う場合は`X-Orca-Resolved-Model`レスポンスヘッダで実際に使われたモデルを取得できるので、デモ画面やログで「今回はこのモデルが選ばれました」と見せると審査基準6（LLMコスト）へのアピールになる。

### 4.5 画像編集（写真カラー化）— wow機能

OrcaRouterは画像生成・編集モデルもルーティング対象（`openai/gpt-image-1-mini`、`google/imagen-4.0-fast-generate-001`、`grok/grok-imagine-image`等）で、Images系エンドポイント（OpenAI互換の`/v1/images/edits`）にも対応している。白黒写真をアップロードし、「自然な色味でカラー化してください」というプロンプトとともに送るだけで実装できる。既存のチャット呼び出しと同じ認証・SDKの延長で追加コストは小さい。

```
POST /v1/images/edits
  model: "openai/gpt-image-1-mini"
  image: <白黒写真>
  prompt: "この写真を自然な色合いでカラー化してください。人物・服装・背景の改変はしないでください。"
```

用途は単体機能としてではなく、写真ベース質問生成（11章）とセットで使う：写真アップロード→カラー化（見た目のwow）→その写真を踏まえた質問をAIが生成、という一連の流れにする。

---

## 5. データモデル（Prismaスキーマ相当）

```
Person      id, name, relation, createdAt

Session     id, personId, questionText, occasionHint,   // 裏層マッピング。非開示
            videoPath, audioPath, recordedAt, durationSec,
            status(uploading|processing|structured)

Utterance   id, sessionId, startSec, endSec, speaker, text

Episode     id, sessionId, title, startSec, endSec,
            tags[], era, people[], theme, deliverTo, occasion,
            excluded(bool)   // 収録者本人が除外指定できる（企画書6.2）

Coverage    id, personId, occasion, status(covered|thin|empty),
            suggestedQuestions[]

Delivery    id, personId, occasion, deliveredAt, exportBundlePath

Photo       id, personId, originalPath, colorizedPath,
            uploadedAt, usedInSessionId   // カラー化に使った写真と、それを踏まえて生成したセッションの紐付け
```

`occasionHint`（質問の裏層＝想定配信先）はUI上非開示。除外フラグ（`excluded`）を立てたEpisodeは検索・配信対象から外す。

---

## 6. 画面一覧

| # | 画面 | 対応する利用フロー |
| :---- | :---- | :---- |
| 1 | 対象者登録 | 5章 #2（申込） |
| 2 | 収録画面（質問提示→プッシュトゥトーク→アップロード） | 5章 #3 |
| 3 | カバレッジマップ（未収録領域の提示。進捗バー・達成率は表示しない） | 5章 #4 |
| 4 | 配信・検索閲覧画面（質問入力→該当箇所シーク再生） | 5章 #7 |
| 5 | エクスポート（ダウンロードトリガー） | 9章「エクスポート／継続性の設計」 |

画面3は「宿題感」を出さないこと（企画書7.4）。未収録＝次の質問候補の提示であり、未達成の指摘ではない。

---

## 7. API設計（案）

| メソッド・パス | 内容 |
| :---- | :---- |
| `POST /api/persons` | 対象者登録 |
| `POST /api/sessions` | セッション作成（質問文・occasionHintを紐付け） |
| `POST /api/sessions/:id/upload` | チャンクアップロード（またはfinalize時に一括） |
| `POST /api/sessions/:id/finalize` | STT→構造化パイプライン起動 |
| `GET /api/persons/:id/coverage` | カバレッジマップ取得 |
| `GET /api/persons/:id/next-question` | 未収録領域から次の質問候補を返す |
| `GET /api/persons/:id/episodes/search?q=` | キーワード・タグ検索（サーバー版。閲覧側オフライン版はクライアントJSで同等ロジック） |
| `POST /api/persons/:id/export` | video+SRT+JSON+ビューアHTMLのバンドルを生成・zip化 |
| `POST /api/persons/:id/photos` | 写真アップロード→OrcaRouter Images編集でカラー化 |
| `POST /api/persons/:id/photos/:photoId/suggest-question` | カラー化写真を踏まえた質問をLLMで生成 |

---

## 8. エクスポート仕様

配信のたびに以下をzipでまとめて渡す（CLAUDE.md「エクスポート／継続性の設計」準拠）。

```
export/
  videos/
    session_001.webm
    session_002.webm
    ...
  subtitles/
    session_001.srt
    session_002.srt
    ...
  data.json        # Episode/Coverage/タグ情報。閲覧側HTMLが読み込む
  viewer.html       # 自己完結型。data.jsonを読み込みキーワード・タグ絞り込みのみ。サーバー・LLM不要
```

`viewer.html`はクライアントサイドJSのみで完結させる（外部通信なし）。検索は`data.json`内のtags/textに対する文字列マッチで十分（企画書6.5の「動画の切り出し・結合は行わない、シーク再生のみ」原則をここでも守る）。

---

## 9. 実装優先順位・スケジュール（企画書13.2準拠）

| 日程 | 内容 |
| :---- | :---- |
| 8/13（今日） | STT疎通確認（Gemini音声入力）、iOS Safari実機での録画検証、雛形構築（Next.js+Prisma）、ダミートランスクリプトでの構造化ロジック先行実装 |
| 8/14 | カバレッジマップ・収録画面の実装、実インタビュー収録、記事骨子作成 |
| 8/15 | デモ動画撮影・編集、記事仕上げ、APIキー確認、提出（15:00締切） |

構造化処理（LLM呼び出し部分）はダミーデータで収録機能と並行実装できる。

---

## 10. 実装開始時に確認すべきこと（Claude Codeで着手時に検証）

- iOS Safariでの`MediaRecorder`録画可否（不可なら音声のみに縮退。企画書12.2）
- OrcaRouterダッシュボードでの実際のモデル在庫・料金（本書のモデル名は2026-08-13のドキュメント確認時点のもの）
- Gemini音声入力のインラインサイズ上限の実測（3〜5分の音声で問題ないか）
- `response_format`によるJSON Schema制約の実際の挙動（Gemini/Claude双方で試す）

---

## 11. 写真カラー化：競合状況と位置づけ（2026-08-13調査）

単体機能としては新規性がないことを踏まえて位置づけること。

### 競合

| 分類 | 例 | 備考 |
| :---- | :---- | :---- |
| 汎用AIカラー化ツール（海外） | MyHeritage In Color、Remini、Palette.fm、VanceAI、ColouriseSG 等 | 無料〜低価格の消費者向けアプリが多数存在。技術としてはコモディティ化済み |
| 遺影加工業者（国内、最も近い競合） | カメラのキタムラ（店舗・ネット、最短当日）、株式会社みづま（遺影加工専門、背景変更・家紋挿入等も）、アスカフューネラルサポート（葬儀社向けBtoB） | **葬儀業界では白黒写真のカラー化は既に一般的なオプションメニュー**。ノコセルと同一市場に既存プレイヤーがいる |
| 隣接の高リスク領域 | MyHeritage Deep Nostalgia（静止画の顔を動かすアニメーション機能） | SNSでバイラルした一方「気味が悪い」という否定的反応も広く報じられている。企画書7.1が「一人称での人格再現」を不採用とする判断の妥当性を裏付ける実例 |

### 料金相場（2026-08-13調査）

| 項目 | 相場 |
| :---- | :---- |
| カラー化単体（簡易補正） | 約¥500 |
| カラー化単体（作り込みが必要な場合／AI技術を明示するケース） | ¥3,000〜5,000 |
| 遺影加工全体（作成・プリント込み） | ¥5,000〜1万円 |
| 葬儀会社経由の遺影写真一式 | ¥1万〜3万円 |

カラー化単体は数百円〜数千円の低単価な付帯オプションとして扱われている。ノコセルの一時金（数万円）に組み込む分には原価上問題にならないが、主要な訴求点にすると「数百円で他社もやっている機能」と見なされるリスクがある。

### 位置づけの結論

写真カラー化は葬儀業界で既にコモディティ化しており、**単体の差別化要素にはならない**。ピッチでは「カラー化ができる」ことを訴求するのではなく、「カラー化した写真を踏まえてAIが個別化された質問を生成する」という組み合わせ（4.5節・写真ベース質問生成）を差別化点として説明すること。カラー化のみを前面に出すと、既存の遺影加工業者との違いを問われたときに弱い。

一方でDeep Nostalgiaの事例は、「カラー化に留め、顔を動かす・声を出させるところまではいかない」というノコセルの一貫した設計判断（7.1）が、実際の市場の反応からも支持される根拠として使える。

---

## 参照元

- `nokoseru_planning.md`（企画概要）
- `research_report.md`（市場・競合・倫理調査）
- CLAUDE.md「実装方針の確定事項（2026-08-13）」
- OrcaRouter公式ドキュメント（[docs.orcarouter.ai/ja](https://docs.orcarouter.ai/ja/introduction)、2026-08-13時点）
- 写真カラー化の競合調査（2026-08-13、Web検索）：[カメラのキタムラ 遺影加工](https://www.kitamura-print.com/data_conversion/restoration_photo/index.html)／[株式会社みづま 遺影写真加工](https://mizuma-com.jp/photo/)／[アスカフューネラルサポート](https://www.mds.ne.jp/service_product.html)
