# Hướng dẫn API AI / AI provider guide

DT Poster Studio hỗ trợ API cá nhân từ OpenAI (ChatGPT), Gemini, Claude (Anthropic) và Grok (xAI). Mở [`api-guide.html`](../public/api-guide.html) trên web hoặc chọn **Hướng dẫn lấy API** trong **Cài đặt kết nối** để xem hướng dẫn song ngữ và liên kết chính thức.

## Dùng API cá nhân

1. Tạo API key tại nhà cung cấp và kiểm tra quyền, hạn mức, thanh toán của tài khoản.
2. Mở **Cài đặt kết nối → API cá nhân** trong ứng dụng.
3. Chọn nhà cung cấp, đặt tên cấu hình, dán API key. Model được điền sẵn; có thể đổi sang model khác mà API của bạn hỗ trợ.
4. Nhấn **Lưu API trên thiết bị**. Thêm nhiều cấu hình nếu cần, rồi chọn **Dùng API này** để chuyển provider hoặc tài khoản.
5. Kết nối tới server AI của bạn bằng URL HTTPS. Khi yêu cầu gợi ý tên/mô tả từ ảnh, app gửi API key, ảnh và thông tin sản phẩm đến server đã cấu hình để server gọi đúng nhà cung cấp.

API cá nhân được mã hóa và lưu cục bộ: Web dùng kho mã hóa trong hồ sơ trình duyệt hiện tại; Windows/macOS desktop dùng Electron `safeStorage` dựa trên kho bảo mật hệ điều hành. Cấu hình web không đồng bộ qua Supabase hay trình duyệt khác. API key không được lưu trong GitHub Pages, Supabase hoặc database của server. Server chỉ nhận key trong RAM cho request đó và không ghi body request vào log. Xóa cấu hình trong app để bỏ key khỏi thiết bị.

Chỉ kết nối tới server bạn tin cậy: server sẽ nhận key cùng ảnh trong lúc xử lý và chuyển ảnh/key tới provider đã chọn. Không nhập API key vào server công cộng không thuộc quyền kiểm soát của bạn. Tính năng xóa nền dùng U²-Net trên server và không cần API key nhà cung cấp.

## Lấy API key chính thức

- [OpenAI / ChatGPT API Keys](https://platform.openai.com/api-keys) — API usage và thanh toán tách biệt với gói ChatGPT.
- [Google AI Studio API key](https://aistudio.google.com/apikey) — kiểm tra project Google Cloud và quota gắn với khóa.
- [Anthropic Console API Keys](https://console.anthropic.com/settings/keys) — Claude API dùng tài khoản Console và hạn mức riêng.
- [xAI Console API Keys](https://console.x.ai/team/default/api-keys) — kiểm tra credits và giới hạn sử dụng trong Console.

## API mặc định của máy chủ (tùy chọn)

Chủ máy chủ có thể cấu hình khóa mặc định trong `.env`. Khóa mặc định được dùng khi client không gửi profile cá nhân. Không dùng biến `VITE_*`, không commit `.env`, và không đưa khóa vào bộ cài desktop.

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini

# Optional provider defaults
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
XAI_API_KEY=
XAI_MODEL=grok-4.7
```

Sau khi đổi `.env`, khởi động lại server. Nếu server được mở ra mạng, yêu cầu `APP_ACCESS_TOKEN`, HTTPS reverse proxy và origin chính xác trong `ALLOWED_ORIGINS`. Thông tin cấu hình máy chủ có trong [README](../README.md#đưa-lên-máy-chủ-windows-10).

## English

DT Poster Studio supports personal API keys from OpenAI (ChatGPT), Gemini, Claude (Anthropic), and Grok (xAI). Open [`api-guide.html`](../public/api-guide.html) or choose **API setup guide** in **Connection Settings** for the bilingual guide and official provider links.

Create a provider key, then open **Connection Settings → Personal API Keys**. Choose a provider, name the profile, paste the key, and save it on this device. The model is prefilled and can be changed. Add multiple profiles and select **Use this API** to switch between providers or accounts. Connect the app to your own AI server over HTTPS. For image suggestions, the key, image, and product details are sent to that server so it can call the selected provider.

The web app encrypts profiles in the current browser profile. Windows/macOS desktop uses Electron `safeStorage` backed by operating-system secure storage. Web profiles do not sync through Supabase or other browsers. Keys are not stored in GitHub Pages, Supabase, or the server database. The server holds a submitted key in memory for that request and does not log request bodies. Use only a server you trust: it receives the key and image during processing and forwards them to the selected provider. Background removal runs U²-Net on the server and does not need a provider key.

Official key pages: [OpenAI](https://platform.openai.com/api-keys), [Gemini](https://aistudio.google.com/apikey), [Claude](https://console.anthropic.com/settings/keys), and [Grok](https://console.x.ai/team/default/api-keys). Provider API billing and quotas are separate from consumer chat subscriptions.

Server operators may optionally set provider defaults in `.env` using `AI_PROVIDER`, provider-specific `*_API_KEY`, and `*_MODEL` variables. Never use `VITE_*` variables, commit `.env`, or package provider keys. Restart the server after changing its environment. Public servers require HTTPS, `APP_ACCESS_TOKEN`, and a precise `ALLOWED_ORIGINS` allowlist.
