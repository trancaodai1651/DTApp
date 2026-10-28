"""A dedicated guest browser. Observe responses produced by Douyin's own page."""
import asyncio
import json
import os
from pathlib import Path
import re
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
            state = {"hasMore": None, "listSeen": False, "blocked": False, "coveredSince": False,
                "loginWall": False, "listError": False, "expectedCount": None}
            public_links = {}
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
                    if channel:
                        # Guest channel pages may render public preview cards
                        # without returning the private post-list API response.
                        anchors = await page.locator('[data-e2e="user-post-list"] a[href*="/video/"], [data-e2e="user-post-list"] a[href*="/note/"]').evaluate_all(
                            "nodes => nodes.map(a => ({href:a.href, title:(a.innerText || a.getAttribute('title') || a.querySelector('img')?.alt || '').trim()}))")
                        for anchor in anchors:
                            identity = video_id_from_url(anchor.get("href", ""))
                            if identity:
                                try:
                                    link = douyin_url(anchor["href"])
                                except ValueError:
                                    continue
                                public_links.setdefault(identity, {"id":identity, "url":link,
                                    "title":anchor.get("title", "")[:500]})
                        list_text = await page.locator('[data-e2e="user-post-list"]').inner_text() if await page.locator('[data-e2e="user-post-list"]').count() else ""
                        state["listError"] = state["listError"] or "服务异常" in list_text
                        state["loginWall"] = state["loginWall"] or "登录后查看更多作品" in list_text or "登录查看更多作品" in list_text
                        if state["expectedCount"] is None:
                            profile_text = await page.locator('[data-e2e="user-detail"]').inner_text() if await page.locator('[data-e2e="user-detail"]').count() else list_text
                            count = re.search(r"(\d+)\s*(?:个)?\s*作品|作品\s*([\d,]+)", profile_text)
                            if count:
                                state["expectedCount"] = int((count.group(1) or count.group(2)).replace(",", ""))
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
                if channel and public_links:
                    missing = [link for identity, link in public_links.items() if identity not in records][:24]
                    progress(f"Đang đọc metadata {len(public_links)} video xem trước công khai…")
                    semaphore = asyncio.Semaphore(4)

                    async def resolve_preview(link):
                        async with semaphore:
                            if cancelled():
                                raise asyncio.CancelledError()
                            detail_page = await context.new_page()
                            detail_records = {}
                            detail_pending = set()

                            async def detail_response(response):
                                host = urlparse(response.url).hostname or ""
                                if not (host == "douyin.com" or host.endswith(".douyin.com")) or "aweme/" not in response.url:
                                    return
                                try:
                                    payload = await response.json()
                                    for video in aweme_records(payload):
                                        detail_records[video["id"]] = video
                                except Exception:
                                    pass

                            def schedule_detail(response):
                                task = asyncio.create_task(detail_response(response))
                                detail_pending.add(task)
                                task.add_done_callback(detail_pending.discard)

                            detail_page.on("response", schedule_detail)
                            try:
                                await detail_page.goto(link["url"], wait_until="domcontentloaded", timeout=12000)
                                for _ in range(4):
                                    embedded = await detail_page.locator('script#RENDER_DATA, script#__NEXT_DATA__, script#__UNIVERSAL_DATA_FOR_REHYDRATION__').all_text_contents()
                                    for raw in embedded:
                                        try:
                                            for video in aweme_records(json.loads(unquote(raw))):
                                                detail_records[video["id"]] = video
                                        except (ValueError, TypeError):
                                            pass
                                    if link["id"] in detail_records:
                                        break
                                    await detail_page.wait_for_timeout(500)
                                if detail_pending:
                                    await asyncio.gather(*list(detail_pending), return_exceptions=True)
                                return detail_records.get(link["id"])
                            except Exception:
                                return None
                            finally:
                                detail_page.remove_listener("response", schedule_detail)
                                if detail_pending:
                                    await asyncio.gather(*list(detail_pending), return_exceptions=True)
                                await detail_page.close()

                    resolved = await asyncio.gather(*(resolve_preview(link) for link in missing))
                    for link, video in zip(missing, resolved, strict=True):
                        if video and (not video.get("secUid") or video.get("secUid") == sec_uid):
                            records[video["id"]] = video
                        elif link["id"] not in records:
                            records[link["id"]] = {"id":link["id"], "title":link["title"] or link["id"],
                                "createdAt":None, "url":link["url"], "author":"", "secUid":sec_uid,
                                "cover":"", "mediaUrls":[], "duration":0, "width":0, "height":0,
                                "bitRate":0, "isImage":False}
                    values = [v for v in records.values() if v.get("secUid") == sec_uid]
                if not values:
                    if channel and state["listError"]:
                        raise GuestBlocked("Trang kênh Douyin đang báo 服务异常 và chưa trả video cho phiên khách. Thử mở cửa sổ Douyin khách rồi quét lại sau; app không tự đăng nhập hoặc vượt giới hạn của Douyin.")
                    if channel and state["loginWall"]:
                        raise GuestBlocked("Douyin yêu cầu đăng nhập để hiện bài đăng của kênh. Phiên khách không tải được video; hãy thử lại khi Douyin cho xem công khai.")
                    raise GuestBlocked("Douyin chưa trả dữ liệu cho phiên khách. Mở cửa sổ khách, kiểm tra CAPTCHA/thông báo trên trang rồi thử lại. Không cần đăng nhập; nội dung yêu cầu đăng nhập không thể tải bằng chế độ khách.")
                complete = bool(target or (state["listSeen"] and (state["hasMore"] == 0 or state["coveredSince"])) or
                    (state["expectedCount"] is not None and len(values) >= state["expectedCount"]))
                if channel and state["loginWall"]:
                    warning = f"Đang hiển thị {len(values)} video xem trước công khai" + (f" trên {state['expectedCount']} video của kênh" if state["expectedCount"] else " của kênh") + ". Douyin yêu cầu đăng nhập để xem phần còn lại, nên chế độ khách không thể tải đủ danh sách."
                else:
                    warning = "" if complete else "Chỉ lấy được một phần video công khai. Douyin chưa xác nhận hết trang; chưa thể coi là toàn bộ kênh."
                return {"videos": values, "complete": complete, "resolvedUrl": final_url,
                    "warning": warning}
            finally:
                page.remove_listener("response", schedule)
                if pending:
                    await asyncio.gather(*list(pending), return_exceptions=True)
                await page.close()
