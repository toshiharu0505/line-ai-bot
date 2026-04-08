# LINE 自動返信AIボット

LINEメッセージを受信し、Claude AIが3分後に自然なビジネス口調で返信する自動応答ボットです。

---

## セットアップ手順

### 1. 依存パッケージのインストール

```bash
cd line-ai-bot
npm install
```

---

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して各キーを設定します。

```env
LINE_CHANNEL_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
LINE_CHANNEL_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 3. LINE Developers でのチャネル設定

1. [LINE Developers Console](https://developers.line.biz/console/) にログイン
2. **Messaging API チャネル** を作成（または既存チャネルを選択）
3. 「チャネル基本設定」→ **チャネルシークレット** をコピー → `.env` の `LINE_CHANNEL_SECRET` に貼り付け
4. 「Messaging API設定」→ **チャネルアクセストークン（長期）** を発行してコピー → `LINE_CHANNEL_ACCESS_TOKEN` に貼り付け
5. 「応答メッセージ」を **オフ** にする（自動返信との二重送信を防ぐため）
6. 「あいさつメッセージ」は任意でオフにする

---

### 4. ngrok でローカル公開

別ターミナルで ngrok を起動します。

```bash
# ngrok のインストール（未インストールの場合）
brew install ngrok   # macOS
# または https://ngrok.com からダウンロード

# ローカルサーバーを公開
ngrok http 3000
```

出力例：
```
Forwarding  https://xxxx-xxx-xxx-xxx.ngrok-free.app -> http://localhost:3000
```

この `https://xxxx-xxx-xxx-xxx.ngrok-free.app` をコピーします。

---

### 5. Webhook URL の設定

1. LINE Developers Console → 「Messaging API設定」
2. **Webhook URL** に `https://xxxx-xxx-xxx-xxx.ngrok-free.app/webhook` を入力
3. 「検証」ボタンで `200 OK` を確認
4. **Webhookの利用** を **オン** にする

---

### 6. サーバー起動

```bash
# 本番起動
npm start

# 開発（ファイル変更で自動再起動）
npm run dev
```

起動確認：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LINE AI Bot 起動完了
  ポート     : 3000
  返信遅延   : 3分 (180000ms)
  Webhook URL: http://localhost:3000/webhook
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 動作フロー

```
ユーザー → LINE → Webhook → index.js
                               ↓
                          3分待機（setTimeout）
                               ↓
                        Claude API で返信生成
                               ↓
                    LINE Push Message API で送信
                               ↓
                          ユーザーに届く
```

> **なぜ Reply API ではなく Push API を使うのか？**
> LINEの Reply Token は受信から約30秒で失効します。3分の遅延を実現するため、ユーザーIDを使った Push Message API を採用しています。

---

## 環境変数一覧

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `LINE_CHANNEL_SECRET` | ✅ | LINEチャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINEチャネルアクセストークン |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API キー |
| `PORT` | - | サーバーポート（デフォルト: 3000） |
| `REPLY_DELAY_MS` | - | 返信遅延ミリ秒（デフォルト: 180000 = 3分） |

---

## カスタマイズ

### 返信遅延を変更する

`.env` の `REPLY_DELAY_MS` を変更します。

```env
REPLY_DELAY_MS=60000   # 1分
REPLY_DELAY_MS=300000  # 5分
```

### AIの口調・設定を変更する

`index.js` の `SYSTEM_PROMPT` を編集します。業種や用途に合わせて調整してください。

---

## 本番環境へのデプロイ

ngrok はローカルテスト用です。本番環境では以下を推奨します。

- **Railway** / **Render** / **Fly.io** - シンプルなNode.jsホスティング
- **AWS Lambda + API Gateway** - サーバーレス構成
- **VPS（さくらVPS, Linode等）** - PM2でプロセス管理

本番では ngrok の URL を実際のサーバーURLに置き換え、LINE DevelopersのWebhook URLを更新してください。

---

## トラブルシューティング

| 症状 | 原因と対処 |
|------|-----------|
| `SignatureValidationFailed` | `LINE_CHANNEL_SECRET` が間違っている |
| 返信が届かない | `LINE_CHANNEL_ACCESS_TOKEN` が失効している、またはPush APIの権限がない |
| ngrok URLが変わる | 毎回ngrok再起動時にURLが変わります。LINE DevelopersのWebhook URLも更新してください |
| 同じユーザーに返信が重複する | 二重送信防止機能（`processingUsers`マップ）が動作しているはずです。ログを確認してください |
