# DT Poster Studio · AI provider setup

API keys stay in the Node server's `.env` file. Never paste a provider key into GitHub Pages, browser code, or a `VITE_*` variable.

Create a key:
- OpenAI / ChatGPT: https://platform.openai.com/api-keys
- Gemini: https://aistudio.google.com/apikey
- Grok / xAI: https://console.x.ai/team/default/api-keys

On Windows Server, copy `.env.example` to `.env`, then select one provider:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

For Gemini use `AI_PROVIDER=gemini`, `GEMINI_API_KEY=your_key_here`, and `GEMINI_MODEL=gemini-3.8-flash`. For Grok use `AI_PROVIDER=grok`, `XAI_API_KEY=your_key_here`, and `XAI_MODEL=grok-4.7`. Restart the server after saving.
