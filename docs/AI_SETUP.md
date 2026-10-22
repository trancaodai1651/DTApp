# Cấu hình AI / AI provider setup

DT Poster Studio gọi OpenAI, Gemini hoặc Grok từ server Node. API key chỉ nằm trong `.env` trên máy chạy server Windows, không nằm trong Git, GitHub Pages hay ứng dụng desktop.

## Lấy API key

- OpenAI / ChatGPT: tạo key tại [platform.openai.com/api-keys](https://platform.openai.com/api-keys). API tính phí và hạn mức riêng với gói ChatGPT.
- Gemini: tạo key tại [Google AI Studio](https://aistudio.google.com/apikey). Hạn mức và thanh toán theo project Google Cloud.
- Grok / xAI: tạo key tại [xAI Console](https://console.x.ai/team/default/api-keys). Tài khoản API có thể cần nạp credits.

## Thêm key trên Windows Server

Trong thư mục `DTApp`, sao chép `.env.example` thành `.env`. Chọn một nhà cung cấp và điền các dòng tương ứng:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Hoặc Gemini:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Hoặc Grok:

```dotenv
AI_PROVIDER=grok
XAI_API_KEY=your_key_here
XAI_MODEL=grok-4.7
```

Lưu file rồi khởi động lại server. Đặt thêm `APP_ACCESS_TOKEN` trước khi mở server ra mạng và thêm đúng GitHub Pages origin vào `ALLOWED_ORIGINS`. Mỗi provider key được đọc riêng trên server; không tạo biến `VITE_*` cho khóa API.

## Get API keys

- OpenAI / ChatGPT: create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). API billing and limits are separate from a ChatGPT subscription.
- Gemini: create a key in [Google AI Studio](https://aistudio.google.com/apikey). Usage follows the linked Google Cloud project.
- Grok / xAI: create a key in the [xAI Console](https://console.x.ai/team/default/api-keys). API usage may require credits.

On the Windows Server, copy `.env.example` to `.env`, set `AI_PROVIDER` to `openai`, `gemini`, or `grok`, fill that provider's key and optional model, then restart the server. Keep every provider key on the server. GitHub Pages hosts only the browser UI and cannot hold a private provider key.
