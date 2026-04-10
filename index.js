'use strict';

require('dotenv').config();

const express = require('express');
const { Client, middleware, validateSignature } = require('@line/bot-sdk');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const https = require('https');

// ─── 設定 ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const REPLY_DELAY_MS = parseInt(process.env.REPLY_DELAY_MS || '180000', 10); // デフォルト3分

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const lineClient = new Client(lineConfig);
const anthropic = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || "").trim() });

// ─── バリデーション ────────────────────────────────────────────────────────

function validateEnv() {
  const required = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[ERROR] 環境変数が設定されていません: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ─── Claude API ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは北村敏春（トシ）の代理として返信するAIアシスタントです。
以下の特徴で返信してください：
- 40代男性、家電修理技術者兼フリーランスのクリエイター
- 丁寧だが親しみやすいビジネス口調
- 短すぎず長すぎない自然な文章
- 絵文字は1〜2個まで
- AIとバレない自然な日本語
- 仕事の依頼には「確認して折り返します」系の返し
- 挨拶には温かく自然に返す

返信文のみを出力し、前置きや注釈は一切つけないでください。`;

async function generateReply(userMessage) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  return response.content[0].text.trim();
}

// ─── LINE メッセージ処理 ───────────────────────────────────────────────────

// 処理中ユーザーの管理（二重送信防止）
const processingUsers = new Map();

async function handleMessage(event) {
  const { type, source, message } = event;

  if (type !== 'message' || message.type !== 'text') return;

  const userId = source.userId;
  const userText = message.text;

  // 同じユーザーへの返信が既にスケジュール済みの場合はスキップ
  if (processingUsers.has(userId)) {
    console.log(`[SKIP] ユーザー ${userId} は処理中`);
    return;
  }

  console.log(`[RECV] userId=${userId} | text="${userText}"`);
  processingUsers.set(userId, Date.now());

  // 3分後に返信
  setTimeout(async () => {
    try {
      console.log(`[PROC] 返信生成開始 userId=${userId}`);
      const replyText = await generateReply(userText);

      await lineClient.pushMessage(userId, {
        type: 'text',
        text: replyText,
      });

      console.log(`[SENT] userId=${userId} | reply="${replyText.substring(0, 50)}..."`);
    } catch (err) {
      console.error(`[ERROR] 返信送信失敗 userId=${userId}:`, err.message);
    } finally {
      processingUsers.delete(userId);
    }
  }, REPLY_DELAY_MS);
}

// ─── Express サーバー ──────────────────────────────────────────────────────

function createApp() {
  const app = express();

  // ヘルスチェック（署名検証不要）
  app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'LINE AI Bot is running' });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // LINE Webhookエンドポイント（署名検証あり）
  app.post(
    '/webhook',
    middleware(lineConfig),
    async (req, res) => {
      // LINE SDK middleware がすでに検証済みのためすぐ200を返す
      res.sendStatus(200);

      const events = req.body.events;
      if (!Array.isArray(events)) return;

      // イベントを並列処理（エラーは個別にキャッチ）
      await Promise.allSettled(events.map(handleMessage));
    }
  );

  // エラーハンドラ
  app.use((err, req, res, next) => {
    if (err.name === 'SignatureValidationFailed') {
      console.error('[WARN] 署名検証失敗 – 不正なリクエストを拒否');
      return res.status(403).json({ error: 'Invalid signature' });
    }
    console.error('[ERROR] 予期しないエラー:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// ─── 自己ping（Renderスリープ防止） ────────────────────────────────────────

const SELF_PING_URL = 'https://line-ai-bot-ybi2.onrender.com/health';
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5分

function startSelfPing() {
  setInterval(() => {
    https.get(SELF_PING_URL, (res) => {
      console.log(`[PING] ${SELF_PING_URL} -> ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`[PING] エラー: ${err.message}`);
    });
  }, PING_INTERVAL_MS);
  console.log(`[PING] 自己ping開始 (${PING_INTERVAL_MS / 60000}分間隔)`);
}

// ─── 起動 ──────────────────────────────────────────────────────────────────

validateEnv();

const app = createApp();
startSelfPing();

app.listen(PORT, () => {
  const delayMin = Math.round(REPLY_DELAY_MS / 60000);
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LINE AI Bot 起動完了
  ポート     : ${PORT}
  返信遅延   : ${delayMin}分 (${REPLY_DELAY_MS}ms)
  Webhook URL: http://localhost:${PORT}/webhook
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
