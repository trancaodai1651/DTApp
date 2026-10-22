import { createApp } from './app.mjs';
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.APP_ACCESS_TOKEN) throw new Error('Đặt APP_ACCESS_TOKEN trước khi mở server ra mạng.');
const app = createApp({
  accessToken: process.env.APP_ACCESS_TOKEN,
  allowedOrigins: process.env.ALLOWED_ORIGINS,
  aiProvider: process.env.AI_PROVIDER || 'openai',
  aiKeys: { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY, grok: process.env.XAI_API_KEY },
  aiModels: { openai: process.env.OPENAI_MODEL, gemini: process.env.GEMINI_MODEL, anthropic: process.env.ANTHROPIC_MODEL, grok: process.env.XAI_MODEL },
  aiKey: process.env.OPENAI_API_KEY,
  aiModel: process.env.OPENAI_MODEL,
  aiBase: process.env.OPENAI_BASE_URL,
});
const server = app.listen(port, host, () => console.log(`DT Poster Studio server: http://${host}:${port}`));
server.requestTimeout = 120000;
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
