"""A dedicated guest browser. Observe responses produced by Douyin's own page."""
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlparse
from domain import aweme_records, douyin_url, video_id_from_url


class GuestBlocked(RuntimeError):
    pass


class GuestBrowser:
    def __init__(self, root):
        self.root = Path(root)
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(self.root / "browsers")
        self.runtime = self.context = None
        self.visible = False
        self.lock = asyncio.Lock()

    async def start(self, visible=False):
        if self.context and (not visible or self.visible):
            return self.context
        await self.close()
        from playwright.async_api import async_playwright
        self.runtime = await async_playwright().start()
        try:
            self.context = await self.runtime.chromium.launch_persistent_context(
                str(self.root / "guest-profile"), headless=not visible,
                viewport={"width": 1280, "height": 900}, locale="zh-CN",
                accept_downloads=False)
            self.visible = visible
            return self.context
        except Exception as error:
            await self.close()
            raise RuntimeError("Chưa có Chromium khách. Bấm Cài trình duyệt trong Cài đặt Douyin. " + str(error).splitlines()[0]) from error

    async def close(self):
        if self.context:
            try:
                await self.context.close()
            except Exception:
                pass
        if self.runtime:
            await self.runtime.stop()
        self.context = self.runtime = None

    async def open(self, url):
        async with self.lock:
            context = await self.start(True)
            page = await context.new_page()
            await page.goto(douyin_url(url), wait_until="domcontentloaded", timeout=45000)
            return {"opened": True}

    async def collect(self, url, progress, cancelled, max_scrolls=600, since=None, on_videos=None):
        async with self.lock:
            context = await self.start()
            page = await context.new_page()
            records, pending, seen_cursors = {}, set(), set()
            state = {"hasMore": None, "listSeen": False, "blocked": False, "coveredSince": False}
            async def on_response(response):
                host = urlparse(response.url).hostname or ""
                if not (host == "douyin.com" or host.endswith(".douyin.com")):
                    return
                if "aweme/" not in response.url:
                    return
                try:
                    payload = await response.json()
                    batch = aweme_records(payload)
                    for video in batch:
                        records[video["id"]] = video
                    if "/aweme/post/" in response.url:
                        state["listSeen"] = True
                        state["hasMore"] = payload.get("has_more", payload.get("hasMore"))
                        if "max_cursor" in payload:
                            seen_cursors.add(str(payload["max_cursor"]))
                            try:
                                cursor = int(payload["max_cursor"])
                                if since is not None and 1_000_000_000_000 < cursor < 10_000_000_000_000 and cursor / 1000 <= since:
                                    state["coveredSince"] = True
                            except (TypeError, ValueError):
                                pass
                        if on_videos:
                            on_videos(batch)
                    if payload.get("status_code") in (8, 9, 10000, 1024) or payload.get("verify_type"):
                        state["blocked"] = True
                except Exception:
                    pass
            def schedule(response):
                task = asyncio.create_task(on_response(response))
                pending.add(task)
                task.add_done_callback(pending.discard)
            page.on("response", schedule)
            try:
                await page.goto(douyin_url(url), wait_until="domcontentloaded", timeout=45000)
                final_url = douyin_url(page.url)
                target = video_id_from_url(final_url) or video_id_from_url(douyin_url(url))
                channel = "/user/" in final_url and not target
                sec_uid = urlparse(final_url).path.split("/user/")[-1].split("/")[0] if channel else None
                stale, previous = 0, (-1, -1)
                for turn in range(max_scrolls if channel else 12):
                    if cancelled():
                        raise asyncio.CancelledError()
                    await page.wait_for_timeout(1500)
                    embedded = await page.locator('script#RENDER_DATA, script#__NEXT_DATA__, script#__UNIVERSAL_DATA_FOR_REHYDRATION__').all_text_contents()
                    for raw in embedded:
                        try:
                            for video in aweme_records(json.loads(unquote(raw))):
                                records[video["id"]] = video
                        except (ValueError, TypeError):
                            pass
                    if target and target in records and (records[target]["mediaUrls"] or records[target]["isImage"]):
                        break
                    progress(f"Đã tìm thấy {len(records)} video · trang {turn + 1}")
                    if channel and state["listSeen"] and (state["hasMore"] == 0 or state["coveredSince"]):
                        break
                    current = (len(records), len(seen_cursors))
                    stale = stale + 1 if current == previous else 0
                    previous = current
                    if stale >= 8 or state["blocked"]:
                        break
                    await page.mouse.wheel(0, 2000)
                if pending:
                    await asyncio.gather(*list(pending), return_exceptions=True)
                values = [v for v in records.values() if (v["id"] == target if target else (not sec_uid or v["secUid"] == sec_uid))]
                if not values:
                    raise GuestBlocked("Douyin chưa trả dữ liệu cho phiên khách. Mở cửa sổ khách, kiểm tra CAPTCHA/thông báo trên trang rồi thử lại. Không cần đăng nhập; nội dung yêu cầu đăng nhập không thể tải bằng chế độ khách.")
                complete = bool(target or (state["listSeen"] and (state["hasMore"] == 0 or state["coveredSince"])))
                return {"videos": values, "complete": complete, "resolvedUrl": final_url,
                    "warning": "" if complete else "Chỉ lấy được một phần video công khai. Douyin chưa xác nhận hết trang; chưa thể coi là toàn bộ kênh."}
            finally:
                page.remove_listener("response", schedule)
                if pending:
                    await asyncio.gather(*list(pending), return_exceptions=True)
                await page.close()
