"""Local JSON-lines worker; no listening port, credentials or Douyin account."""
import argparse
import asyncio
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import uuid
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from browser import GuestBrowser, GuestBlocked
from domain import date_bounds, douyin_url, in_period, parse_script, safe_name, video_quality, video_id_from_url
from auth import GoogleSession

HIDDEN = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def verify_download_quality(path, expected):
    import imageio_ffmpeg
    result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-i", str(path),
        "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], capture_output=True, timeout=60, **HIDDEN)
    text = result.stderr.decode("utf-8", errors="replace")
    source = next((line for line in text.splitlines() if "Video:" in line), "")
    dimensions = re.search(r"\b(\d{2,6})x(\d{2,6})\b", source)
    if result.returncode or not dimensions:
        raise RuntimeError("Không đọc được luồng hình trong video tải về; chưa lưu thành video hoàn tất.")
    width, height = map(int, dimensions.groups())
    if width * height < video_quality(expected)[0]:
        raise RuntimeError(f"CDN trả bản {width}×{height} thấp hơn nguồn {expected['width']}×{expected['height']}; app không tự hạ chất lượng.")
    return width, height


class MediaRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_media_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def check_media_url(value):
    url = urlparse(value)
    allowed = ("douyinvod.com", "douyin.com", "douyinpic.com", "byteimg.com", "bytecdn.cn", "snssdk.com", "amemv.com", "ibytedtos.com", "pstatp.com", "ixigua.com", "douyincdn.com", "bytecdn.com", "bytedance.com", "zjcdn.com")
    if url.scheme != "https" or url.username or url.password or url.port not in (None, 443) or not any(url.hostname == h or (url.hostname or "").endswith("." + h) for h in allowed):
        raise ValueError("Địa chỉ video không thuộc CDN Douyin được hỗ trợ.")


class Store:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        for table in ("channels", "videos", "jobs", "settings"):
            self.db.execute(f"CREATE TABLE IF NOT EXISTS {table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        self.db.execute("CREATE INDEX IF NOT EXISTS jobs_state ON jobs(json_extract(data,'$.state'))")
        self.db.commit()

    def all(self, table):
        return [json.loads(row[0]) for row in self.db.execute(f"SELECT data FROM {table}")]

    def active_jobs(self):
        return [json.loads(row[0]) for row in self.db.execute("SELECT data FROM jobs WHERE json_extract(data,'$.state') IN ('queued','running')")]

    def get(self, table, identity):
        row = self.db.execute(f"SELECT data FROM {table} WHERE id=?", (identity,)).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, table, record):
        self.db.execute(f"INSERT OR REPLACE INTO {table} VALUES (?,?)", (record["id"], json.dumps(record, ensure_ascii=False)))
        self.db.commit()
        return record

    def delete(self, table, identity):
        self.db.execute(f"DELETE FROM {table} WHERE id=?", (identity,))
        self.db.commit()


class Engine:
    def __init__(self, root, require_google=False):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.store = Store(self.root / "media.sqlite3")
        self.browser = GuestBrowser(self.root)
        self.cancelled = set()
        self.closing = False
        self.tasks = []
        self.require_google = require_google
        self.auth = GoogleSession()
        self.settings = self.store.get("settings", "main") or {
            "id": "main", "downloadDir": str(Path.home() / "Downloads" / "DTApp"),
            "voicePython": "", "device": "auto", "interval": 60}
        self.settings.setdefault("browserVisible", True)
        self.browser.preferred_visible = self.settings["browserVisible"]
        self.browser_bootstrap_requested = False
        for job in self.store.all("jobs"):
            if job["state"] == "running":
                job.update(state="interrupted", message="App đã đóng khi đang xử lý. Bấm Thử lại để tiếp tục.")
                self.store.put("jobs", job)

    def update_job(self, job, **changes):
        if job["id"] in self.cancelled and changes.get("state") not in ("cancelled", "interrupted"):
            return
        job.update(changes, updatedAt=time.time())
        self.store.put("jobs", job)

    def queue(self, kind, payload):
        active_count = self.store.db.execute("SELECT COUNT(*) FROM jobs WHERE json_extract(data,'$.state') IN ('queued','running')").fetchone()[0]
        if active_count >= 20000:
            raise ValueError("Hàng đợi tối đa 20.000 tác vụ. Chờ các tác vụ hiện tại hoàn thành.")
        job = {"id": str(uuid.uuid4()), "kind": kind, "state": "queued", "progress": 0,
            "message": "Đang chờ", "input": payload, "output": "", "createdAt": time.time()}
        self.store.put("jobs", job)
        return {"jobId": job["id"]}

    def snapshot(self):
        channels = self.store.all("channels")
        videos = self.store.all("videos")
        counts = {}
        for video in videos:
            identity = video.get("channelId", "")
            counts[identity] = counts.get(identity, 0) + 1
        for channel in channels:
            channel["videoCount"] = counts.get(channel["id"], 0)
        public_videos = [{k: v for k, v in video.items() if k != "mediaUrls"} for video in videos]
        jobs = sorted(self.store.all("jobs"), key=lambda j: j["createdAt"], reverse=True)
        return {"channels": channels, "videos": sorted(public_videos, key=lambda v: v.get("createdAt") or 0, reverse=True),
            "jobs": [{k: v for k, v in j.items() if k not in {"input", "transcript", "referenceAudio", "referenceText"}} for j in jobs[:300]], "settings": self.settings,
            "runtime": {"browserInstalled": self.browser.installed(), "browserBundled": getattr(sys,"frozen",False) and self.browser.browsers_dir != self.root / "browsers",
                "guestOpen": self.browser.visible and self.browser.context is not None,
                "voiceConfigured": bool(self.settings["voicePython"]), "dataDir": str(self.root)}}

    def save_channel(self, value):
        url = douyin_url(value.get("url", ""))
        identity = value.get("id") or str(uuid.uuid4())
        previous = self.store.get("channels", identity)
        duplicate = next((c for c in self.store.all("channels") if c["url"] == url and c["id"] != identity), None)
        if duplicate:
            raise ValueError("Kênh/link này đã có trong thư viện.")
        channel = previous or {"id": identity, "monitor": False, "interval": 60, "lastCheck": None, "nextCheck": None, "failures": 0, "status": "Chưa kiểm tra"}
        channel.update(url=url, name=str(value.get("name", "")).strip()[:120] or "Kênh Douyin",
            notes=str(value.get("notes", ""))[:4000], tags=str(value.get("tags", ""))[:300], favorite=bool(value.get("favorite")))
        return self.store.put("channels", channel)

    async def dispatch(self, command, payload):
        if command == "heartbeat":
            return {"authenticated":self.auth.ready}
        if command == "snapshot":
            if self.require_google and self.auth.ready and not self.browser_bootstrap_requested and not self.browser.installed():
                self.browser_bootstrap_requested = True
                if not any(j["kind"] == "install_browser" for j in self.store.active_jobs()):
                    self.queue("install_browser", {})
            return self.snapshot()
        if command == "transcript_result":
            job = self.store.get("jobs", payload.get("id", ""))
            if not job or job.get("kind") != "transcribe" or job.get("state") != "done":
                raise ValueError("Bản chép lời chưa sẵn sàng.")
            return {key:job.get(key, "") for key in ("transcript", "detectedLanguage", "referenceAudio", "referenceText", "subtitleFile", "targetLanguage")}
        if command == "save_channel":
            return self.save_channel(payload)
        if command == "remove_channel":
            # Keep downloaded files and history when removing a bookmark.
            for job in self.store.active_jobs():
                if job["input"].get("channelId") == payload["id"]:
                    self.cancelled.add(job["id"])
                    self.update_job(job, state="cancelled", message="Đã bỏ lưu kênh")
            self.store.delete("channels", payload["id"])
            return True
        if command == "save_settings":
            directory = Path(payload["downloadDir"]).expanduser()
            if not directory.is_absolute():
                raise ValueError("Chọn thư mục tải bằng đường dẫn tuyệt đối.")
            directory.mkdir(parents=True, exist_ok=True)
            device = payload.get("device", "auto")
            if device not in ("auto", "cpu", "cuda", "mps"):
                raise ValueError("Thiết bị xử lý không hợp lệ.")
            python = str(payload.get("voicePython", "")).strip()
            if python and not Path(python).is_file():
                raise ValueError("Chọn đúng tập tin Python của môi trường đã cài OmniVoice.")
            visible = payload.get("browserVisible", self.settings["browserVisible"])
            if not isinstance(visible, bool):
                raise ValueError("Chế độ Chromium không hợp lệ.")
            self.settings.update(downloadDir=str(directory), voicePython=python, device=device, browserVisible=visible)
            self.browser.preferred_visible = visible
            self.store.put("settings", self.settings)
            return True
        if command == "monitor":
            channel = self.store.get("channels", payload["id"])
            if not channel:
                raise ValueError("Kênh không còn tồn tại.")
            if "/user/" not in channel["url"]:
                raise ValueError("Cần link trang kênh /user/. Quét video trước để lấy kênh tác giả.")
            interval = int(payload.get("interval", 60))
            if interval < 30 or interval > 86400:
                raise ValueError("Chu kỳ kiểm tra từ 30 giây đến 24 giờ.")
            enabled = bool(payload.get("enabled"))
            channel.update(monitor=enabled, interval=interval, nextCheck=time.time() if enabled else None)
            if enabled and not channel.get("monitorSince"):
                channel["monitorSince"] = int(time.time())
            if not enabled:
                channel.pop("monitorSince", None)
            self.store.put("channels", channel)
            return True
        if command == "scan":
            url = douyin_url(payload.get("url", ""))
            date_bounds(payload.get("mode", "all"), payload.get("anchor"), payload.get("end"))
            return self.queue("scan", {**payload, "url": url})
        if command == "search":
            raw_queries = payload.get("queries")
            if raw_queries is None:
                raw_queries = [{"language": "auto", "query": payload.get("query", "")}]
            if not isinstance(raw_queries, list) or len(raw_queries) > 3:
                raise ValueError("Tìm kiếm tối đa ba từ khóa, mỗi ngôn ngữ một từ khóa.")
            queries, seen = [], set()
            for item in raw_queries:
                if not isinstance(item, dict) or item.get("language") not in ("vi", "en", "zh", "auto"):
                    raise ValueError("Ngôn ngữ từ khóa tìm kiếm không hợp lệ.")
                query = str(item.get("query", "")).strip()
                if not query:
                    continue
                if len(query) > 120 or any(ord(char) < 32 for char in query):
                    raise ValueError("Mỗi từ khóa cần từ 1 đến 120 ký tự.")
                identity = query.casefold()
                if identity not in seen:
                    queries.append({"language": item["language"], "query": query})
                    seen.add(identity)
            if not queries:
                raise ValueError("Nhập ít nhất một từ khóa tiếng Việt, English hoặc 中文.")
            return self.queue("search", {"queries": queries})
        if command == "download":
            ids = payload.get("ids", [])
            if not isinstance(ids, list) or not ids or len(ids) > 10000:
                raise ValueError("Chọn từ 1 đến 10.000 video.")
            return self.enqueue_downloads(ids, force=payload.get("force") is True)
        if command == "dub":
            video = self.store.get("videos", payload.get("videoId"))
            if not video or not video.get("file") or not Path(video["file"]).is_file():
                raise ValueError("Tải video về trước khi lồng tiếng.")
            if not payload.get("fromAudio", False):
                parse_script(payload.get("script", ""))
            if payload.get("language", "vi") not in ("vi", "en", "zh", "ja", "ko"):
                raise ValueError("Ngôn ngữ đầu ra không được hỗ trợ.")
            if payload.get("voiceMode", "narration") not in ("narration", "dub"):
                raise ValueError("Chế độ âm thanh cần là thuyết minh hoặc lồng tiếng.")
            if not self.settings["voicePython"]:
                raise ValueError("Chọn Python đã cài OmniVoice trong Cài đặt Douyin trước.")
            if not payload.get("fromAudio", False) and (not payload.get("refAudio") or not str(payload.get("refText", "")).strip()):
                raise ValueError("Chép lời audio gốc để lấy đoạn tiếng và bản chép làm mẫu giọng OmniVoice.")
            if not payload.get("fromAudio", False) and not Path(payload["refAudio"]).is_file():
                raise ValueError("Tập tin giọng mẫu không tồn tại.")
            if not 0 <= float(payload.get("originalVolume", 0)) <= 1:
                raise ValueError("Âm lượng gốc từ 0 đến 1.")
            return self.queue("dub", payload)
        if command == "transcribe":
            video = self.store.get("videos", payload.get("videoId"))
            if not video or not video.get("file") or not Path(video["file"]).is_file():
                raise ValueError("Tải video về trước khi chép lời audio.")
            if not self.settings["voicePython"]:
                raise ValueError("Chọn Python đã cài OmniVoice trong Cài đặt Douyin trước.")
            if payload.get("targetLanguage") and payload["targetLanguage"] not in ("vi", "en", "zh", "ja", "ko"):
                raise ValueError("Ngôn ngữ phụ đề không được hỗ trợ.")
            return self.queue("transcribe", payload)
        if command == "install_asr":
            if not self.settings["voicePython"] or not Path(self.settings["voicePython"]).is_file():
                raise ValueError("Cài hoặc chọn Python đã cài OmniVoice trước.")
            return self.queue("install_asr", {"python":self.settings["voicePython"]})
        if command == "cancel":
            job = self.store.get("jobs", payload["id"])
            if job and job["state"] in ("queued", "running"):
                self.cancelled.add(job["id"])
                self.update_job(job, state="cancelled", message="Đã hủy")
            return True
        if command == "retry":
            job = self.store.get("jobs", payload["id"])
            if not job or job["state"] not in ("error", "blocked", "interrupted", "cancelled", "partial"):
                raise ValueError("Tác vụ này chưa cần thử lại.")
            return self.queue(job["kind"], job["input"])
        if command == "open_guest":
            return self.queue("guest", {"url": douyin_url(payload.get("url") or "https://www.douyin.com/")})
        if command == "close_guest":
            return self.queue("close_guest", {})
        if command == "install_browser":
            return self.queue("install_browser", {})
        if command == "install_voice":
            python = Path(str(payload.get("python", "")))
            if not python.is_absolute() or not python.is_file():
                raise ValueError("Chọn tập tin Python 3.10+ để tạo môi trường OmniVoice riêng.")
            device = payload.get("device", "cpu")
            if device not in ("cpu", "cuda", "mps"):
                raise ValueError("Chọn CPU, CUDA hoặc MPS để cài PyTorch.")
            if sys.platform == "darwin":
                import platform
                if platform.machine() == "x86_64":
                    raise ValueError("OmniVoice cần PyTorch mới, chưa có wheel chính thức cho macOS Intel. Có thể chọn Python tự biên dịch tương thích ở Cài đặt; tải video vẫn hoạt động.")
            return self.queue("install_voice", {"python":str(python), "device":device})
        if command == "shutdown":
            self.closing = True
            return True
        raise ValueError("Lệnh không được hỗ trợ.")

    def enqueue_downloads(self, ids, force=False):
        queued, skipped = 0, 0
        active = {j["input"].get("videoId") for j in self.store.active_jobs() if j["kind"] == "download"}
        queued_before = len(active)
        if len(ids) + queued_before > 20000:
            raise ValueError("Hàng đợi đã đầy; hãy tải thành nhiều đợt.")
        for identity in dict.fromkeys(ids):
            video = self.store.get("videos", identity)
            if not video or video.get("isImage") or identity in active or (not force and video.get("file") and Path(video["file"]).is_file()):
                skipped += 1
                continue
            self.store.put("jobs", {"id":str(uuid.uuid4()), "kind":"download", "state":"queued", "progress":0,
                "message":"Đang chờ", "input":{"videoId":identity, "force":force}, "output":"", "createdAt":time.time()})
            queued += 1
        return {"queued": queued, "skipped": skipped}

    async def scan(self, job):
        payload = job["input"]
        channel = self.store.get("channels", payload.get("channelId"))
        scan_started = time.time()
        options = {"interactive": not payload.get("monitor", False)}
        if payload.get("monitor") and channel:
            since = channel.get("monitorSince", scan_started)
            cutoff = max(since, channel.get("lastMonitorCoverage", since) - 2*86400)
            sec_uid = urlparse(channel["url"]).path.split("/user/")[-1].split("/")[0]
            def discover(batch):
                current = self.store.get("channels", channel["id"])
                if not current or not current["monitor"] or job["id"] in self.cancelled:
                    return
                ids = []
                for video in batch:
                    if video.get("secUid") != sec_uid or not video.get("createdAt") or video["createdAt"] < since:
                        continue
                    old = self.store.get("videos", video["id"]) or {}
                    self.store.put("videos", {**video, "channelId":channel["id"], "file":old.get("file", ""), "dubbedFile":old.get("dubbedFile", ""), **{key:old.get(key) for key in ("qualityVerified", "downloadWidth", "downloadHeight")}})
                    ids.append(video["id"])
                # Download lanes start immediately, before channel pagination finishes.
                self.enqueue_downloads(ids)
            options = {"since":cutoff, "on_videos":discover, "interactive":False}
        result = await self.browser.collect(payload["url"], lambda message: self.update_job(job, message=message), lambda: job["id"] in self.cancelled, **options)
        # A shared video can discover and bookmark its author's public channel.
        if not channel and result["videos"][0].get("secUid"):
            first = result["videos"][0]
            channel_url = "https://www.douyin.com/user/" + first["secUid"]
            channel = next((c for c in self.store.all("channels") if c["url"] == channel_url), None)
            if not channel:
                channel = self.save_channel({"url": channel_url, "name": first["author"], "notes": "Tác giả từ video đã quét"})
        single_id = video_id_from_url(result.get("resolvedUrl", payload["url"]))
        bounds = date_bounds("all" if single_id else payload.get("mode", "all"), payload.get("anchor"), payload.get("end"))
        matches, unknown_dates = [], 0
        for video in result["videos"]:
            old = self.store.get("videos", video["id"]) or {}
            video.update(file=old.get("file", ""), dubbedFile=old.get("dubbedFile", ""), qualityVerified=old.get("qualityVerified", False), downloadWidth=old.get("downloadWidth"), downloadHeight=old.get("downloadHeight"), channelId=channel["id"] if channel else old.get("channelId", ""))
            self.store.put("videos", video)
            if in_period(video, bounds):
                matches.append(video["id"])
            elif bounds[0] is not None and not video.get("createdAt"):
                unknown_dates += 1
        if channel:
            latest = self.store.get("channels", channel["id"])
            if latest:
                channel = latest
                channel.update(lastCheck=time.time(), failures=0, status="Đã quét" if result["complete"] else result["warning"])
                channel["nextCheck"] = time.time() + channel["interval"] if channel["monitor"] else None
                if payload.get("monitor"):
                    since = channel.get("monitorSince", time.time())
                    matches = [v["id"] for v in result["videos"] if v.get("createdAt") and v["createdAt"] >= since]
                    # Never advance the monitoring watermark: delayed/partial pages may reveal older unseen posts.
                    if channel["monitor"]:
                        self.enqueue_downloads(matches)
                    if result["complete"]:
                        channel["lastMonitorCoverage"] = scan_started
                self.store.put("channels", channel)
        auto_queued = None
        if payload.get("autoDownload") or (single_id and not payload.get("monitor")):
            auto_queued = self.enqueue_downloads(matches)
        warning = result["warning"] + (f" Có {unknown_dates} video thiếu ngày đăng, chưa đưa vào khoảng thời gian." if unknown_dates else "")
        self.update_job(job, state="partial" if warning else "done", progress=100,
            message=f"Tìm thấy {len(result['videos'])} video, {len(matches)} video trong lựa chọn. " + (f"Đã xếp tải {auto_queued['queued']} video chất lượng cao nhất. " if auto_queued else "") + warning,
            resultIds=matches)

    async def search(self, job):
        queries = job["input"].get("queries") or [{"language": "auto", "query": job["input"].get("query", "")}]
        records, warnings = {}, []
        language_names = {"vi": "Tiếng Việt", "en": "English", "zh": "中文", "auto": "từ khóa"}
        for index, item in enumerate(queries, 1):
            query = item["query"]
            language = item.get("language", "auto")
            try:
                result = await self.browser.search(query,
                    lambda message, i=index, lang=language: self.update_job(job,
                        message=f"Tìm {language_names.get(lang, lang)} ({i}/{len(queries)}) · {message}"),
                    lambda: job["id"] in self.cancelled)
            except GuestBlocked as error:
                warnings.append(f"{language_names.get(language, language)}: {error}")
                break
            for video in result["videos"]:
                records[video["id"]] = video
            if result["warning"]:
                warnings.append(f"{language_names.get(language, language)}: {result['warning']}")

        if not records and warnings:
            raise GuestBlocked("; ".join(warnings) or "Douyin chưa trả kết quả tìm kiếm công khai.")
        ids = []
        for video in records.values():
            old = self.store.get("videos", video["id"]) or {}
            video.update(file=old.get("file", ""), dubbedFile=old.get("dubbedFile", ""), qualityVerified=old.get("qualityVerified", False), downloadWidth=old.get("downloadWidth"), downloadHeight=old.get("downloadHeight"),
                channelId=old.get("channelId", ""))
            self.store.put("videos", video)
            ids.append(video["id"])
        warning = " ".join(warnings)
        searched = " + ".join(f"{language_names.get(item.get('language', 'auto'), item.get('language', 'auto'))}: {item['query']}" for item in queries)
        self.update_job(job, state="partial" if warning else "done", progress=100,
            message=f'Tìm thấy {len(ids)} video công khai cho {searched}. ' + warning,
            resultIds=ids)

    async def run_process(self, args, job):
        process = await asyncio.create_subprocess_exec(*map(str, args), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, **HIDDEN)
        async def read():
            tail = []
            while line := await process.stdout.readline():
                text = line.decode("utf-8", "replace").strip()
                tail.append(text)
                tail[:] = tail[-15:]
                if text.startswith(("Đang", "Đã", "Tạo giọng", "Hoàn tất", "Downloading", "Installing", "Successfully installed")) or re.search(r"\b\d+%", text):
                    self.update_job(job, message=text[-700:])
            return "\n".join(tail)
        reader = asyncio.create_task(read())
        try:
            while process.returncode is None:
                if job["id"] in self.cancelled:
                    raise asyncio.CancelledError()
                try:
                    await asyncio.wait_for(process.wait(), timeout=0.3)
                except asyncio.TimeoutError:
                    pass
            output = await reader
            if process.returncode:
                raise RuntimeError(output[-1800:] or f"Tiến trình thoát với mã {process.returncode}")
        finally:
            if process.returncode is None:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), 5)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
            await reader

    async def download(self, job):
        video = self.store.get("videos", job["input"]["videoId"])
        if not video:
            raise ValueError("Video không còn trong thư viện.")
        if not job["input"].get("force") and video.get("file") and Path(video["file"]).is_file():
            self.update_job(job, state="done", progress=100, message="Video đã có trên thiết bị", output=video["file"])
            return
        target_dir = Path(self.settings["downloadDir"]) / safe_name(video.get("author") or "Douyin")
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / (safe_name(video["id"] + "_" + video["title"]) + ".mp4")
        partial = Path(str(target) + ".part")
        # Search/channel previews may expose only a low tier or stale CDN URLs.
        # Resolve the actual video before every new download, even with cached URLs.
        async def refresh_source():
            self.update_job(job, message="Đang lấy nguồn chất lượng cao nhất từ trang video…")
            result = await self.browser.collect(video["url"], lambda m: self.update_job(job, message=m), lambda: job["id"] in self.cancelled, interactive=True)
            fresh = next((item for item in result["videos"] if item["id"] == video["id"]), None)
            if not fresh or not fresh.get("mediaUrls"):
                raise GuestBlocked("Douyin chưa cung cấp nguồn video để xác định chất lượng cao nhất. Kiểm tra tab video đang mở rồi thử lại.")
            return fresh
        fresh = await refresh_source()
        if video.get("mediaUrls") and video_quality(fresh) < video_quality(video):
            raise RuntimeError("Nguồn mới thấp hơn chất lượng đã tìm thấy trước đó. App dừng tải thay vì tự hạ chất lượng; hãy thử lại sau.")
        video.update(fresh)
        best_quality = video_quality(video)
        self.store.put("videos", video)
        context = await self.browser.start()
        page = await context.new_page()
        user_agent = await page.evaluate("navigator.userAgent")
        await page.close()
        loop = asyncio.get_running_loop()
        last_error = None
        # Refresh expired CDN addresses once; never repeatedly hammer a blocked page.
        for attempt in range(2):
            for media in video["mediaUrls"]:
                try:
                    check_media_url(media)
                    cookies = await context.cookies([media])
                    def transfer():
                        headers = {"User-Agent": user_agent, "Referer": "https://www.douyin.com/"}
                        if cookies:
                            headers["Cookie"] = "; ".join(c["name"] + "=" + c["value"] for c in cookies)
                        request = Request(media, headers=headers)
                        with build_opener(MediaRedirects()).open(request, timeout=30) as response, partial.open("wb") as output:
                            content_type = response.headers.get("Content-Type", "")
                            if "text/" in content_type or "json" in content_type:
                                raise RuntimeError("CDN trả trang thông báo thay vì video.")
                            total = int(response.headers.get("Content-Length", 0))
                            size, last = 0, 0
                            while chunk := response.read(256*1024):
                                if job["id"] in self.cancelled or self.closing or (self.require_google and not self.auth.ready):
                                    raise RuntimeError("Đã hủy tải")
                                output.write(chunk)
                                size += len(chunk)
                                if time.monotonic() - last > 0.5:
                                    loop.call_soon_threadsafe(lambda n=size: self.update_job(job, progress=round(n/total*100, 1) if total else 0, message=f"Đang tải {n/1048576:.1f} MB"))
                                    last = time.monotonic()
                            if size < 1024 or (total and size != total):
                                raise RuntimeError("Video tải chưa đủ dữ liệu; giữ lại tác vụ để thử lại.")
                        # CDN responses must contain an MP4 box, not a saved challenge page.
                        with partial.open("rb") as check:
                            if b"ftyp" not in check.read(128):
                                raise RuntimeError("Dữ liệu tải về không phải MP4 hợp lệ.")
                        width, height = verify_download_quality(partial, video)
                        partial.replace(target)
                        return width, height
                    width, height = await asyncio.to_thread(transfer)
                    if job["id"] in self.cancelled:
                        raise asyncio.CancelledError()
                    video["file"] = str(target)
                    video.update(width=width, height=height, qualityVerified=True, downloadWidth=width, downloadHeight=height)
                    self.store.put("videos", video)
                    self.update_job(job, state="done", progress=100, message=f"Đã tải bản cao nhất Douyin cung cấp · {width}×{height} · giữ nguyên luồng hình", output=str(target))
                    return
                except Exception as error:
                    last_error = error
                    if job["id"] in self.cancelled:
                        raise asyncio.CancelledError()
            if attempt == 0:
                fresh = await refresh_source()
                if video_quality(fresh) < best_quality:
                    raise RuntimeError("Lần làm mới chỉ trả nguồn chất lượng thấp hơn. App dừng tải thay vì tự hạ chất lượng; hãy thử lại sau.")
                video.update(fresh)
        raise RuntimeError(str(last_error or "Không có địa chỉ video phát công khai."))

    async def dub(self, job):
        import imageio_ffmpeg
        payload = dict(job["input"])
        video = self.store.get("videos", payload["videoId"])
        if not video or not Path(video.get("file", "")).is_file():
            raise ValueError("Không tìm thấy video gốc trên đĩa.")
        if payload.get("fromAudio", False):
            prepared = self.store.get("jobs", payload.get("subtitleJobId", ""))
            if prepared and prepared.get("kind") == "transcribe" and prepared.get("state") == "done" and prepared["input"].get("videoId") == video["id"] and prepared.get("targetLanguage") == payload.get("language", "vi"):
                result = prepared
                script = payload.get("script") or result["transcript"]
            else:
                result = await self.transcribe(job, finalize=False, target_language=payload.get("language", "vi"))
                script = result["transcript"]
            payload.update(script=script, refAudio=result["referenceAudio"], refText=result["referenceText"])
            parse_script(script)
        work = self.root / "voice-jobs" / job["id"]
        work.mkdir(parents=True, exist_ok=True)
        mode_suffix = "narration" if payload.get("voiceMode", "narration") == "narration" else "dub"
        output = Path(video["file"]).with_name(Path(video["file"]).stem + f"_{mode_suffix}_{job['id'][:8]}.mp4")
        request = {**payload, "segments": parse_script(payload["script"]), "video": video["file"],
            "output": str(output), "work": str(work), "device": self.settings["device"],
            "ffmpeg": imageio_ffmpeg.get_ffmpeg_exe()}
        request_path = work / "request.json"
        request_path.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
        await self.run_process([self.settings["voicePython"], Path(__file__).with_name("voice_runner.py"), request_path], job)
        if not output.is_file() or output.stat().st_size < 1024:
            raise RuntimeError("OmniVoice chưa tạo được video kết quả.")
        video["dubbedFile"] = str(output)
        video["voiceMode"] = mode_suffix
        self.store.put("videos", video)
        self.update_job(job, state="done", progress=100,
            message=("Đã thuyết minh và ghép video" if mode_suffix == "narration" else "Đã lồng tiếng và ghép video"), output=str(output))

    async def ensure_speech_runtime(self, job):
        self.update_job(job, message="Đang chuẩn bị nhận dạng audio và dịch phụ đề…")
        probe = "import faster_whisper, torch; from transformers import AutoModelForCausalLM, AutoTokenizer"
        if self.settings["device"] != "cpu":
            probe += "\nif torch.cuda.is_available(): import bitsandbytes"
        check = await asyncio.to_thread(subprocess.run,
            [self.settings["voicePython"], "-c", probe],
            capture_output=True, timeout=60, **HIDDEN)
        if check.returncode:
            await self.install_asr(job, finalize=False)

    async def transcribe(self, job, finalize=True, target_language=None):
        import imageio_ffmpeg
        await self.ensure_speech_runtime(job)
        video = self.store.get("videos", job["input"]["videoId"])
        if not video or not Path(video.get("file", "")).is_file():
            raise ValueError("Không tìm thấy video gốc trên thiết bị.")
        work = self.root / "speech-jobs" / job["id"]
        work.mkdir(parents=True, exist_ok=True)
        result_path = work / "transcript.json"
        request_path = work / "request.json"
        request_path.write_text(json.dumps({"video":video["file"], "work":str(work),
            "result":str(result_path), "modelDir":str(self.root / "speech-models"),
            "ffmpeg":imageio_ffmpeg.get_ffmpeg_exe()}, ensure_ascii=False), encoding="utf-8")
        await self.run_process([self.settings["voicePython"], Path(__file__).with_name("transcribe_runner.py"), request_path], job)
        if not result_path.is_file():
            raise RuntimeError("Whisper chưa tạo được bản chép lời.")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        transcript = str(result.get("transcript", ""))
        if not transcript or len(transcript) > 50000:
            raise RuntimeError("Bản chép lời rỗng hoặc vượt giới hạn 50.000 ký tự.")
        target = target_language or job["input"].get("targetLanguage") or result.get("detectedLanguage")
        source = result.get("detectedLanguage")
        original_srt = work / "original.srt"
        original_srt.write_text(transcript, encoding="utf-8")
        if target != source:
            translation_request = work / "translate-request.json"
            translation_result = work / "translated.json"
            translation_request.write_text(json.dumps({"sourceLanguage":source, "targetLanguage":target,
                "segments":parse_script(transcript), "contextTitle":video.get("title", ""), "modelDir":str(self.root / "translation-models"),
                "device":self.settings["device"], "result":str(translation_result)}, ensure_ascii=False), encoding="utf-8")
            await self.run_process([self.settings["voicePython"], Path(__file__).with_name("translate_runner.py"), translation_request], job)
            transcript = json.loads(translation_result.read_text(encoding="utf-8"))["transcript"]
        parse_script(transcript)
        subtitle = Path(video["file"]).with_name(Path(video["file"]).stem + f"_{target}_{job['id'][:8]}.srt")
        subtitle.write_text(transcript, encoding="utf-8")
        result.update(transcript=transcript, targetLanguage=target, subtitleFile=str(subtitle))
        self.update_job(job, **({"state":"done", "progress":100} if finalize else {}),
            message=f"Đã tạo phụ đề từ audio {source} → {target}.",
            **{key:result.get(key, "") for key in ("transcript", "detectedLanguage", "referenceAudio", "referenceText", "subtitleFile", "targetLanguage")},
            output=str(subtitle) if finalize else "")
        return result

    async def install_asr(self, job, finalize=True):
        python = job["input"].get("python") or self.settings["voicePython"]
        await self.run_process([python, "-m", "pip", "install", "--disable-pip-version-check", "faster-whisper==1.2.1", "av<19"], job)
        if self.settings["device"] != "cpu":
            cuda = await asyncio.to_thread(subprocess.run, [python, "-c", "import torch; raise SystemExit(0 if torch.cuda.is_available() else 1)"], capture_output=True, timeout=60, **HIDDEN)
            if cuda.returncode == 0:
                await self.run_process([python, "-m", "pip", "install", "--disable-pip-version-check", "bitsandbytes==0.48.2"], job)
        await self.run_process([python, "-c", "from faster_whisper import WhisperModel; from transformers import AutoModelForCausalLM; print('Speech and translation ready')"], job)
        self.update_job(job, **({"state":"done", "progress":100} if finalize else {}),
            message="Đã cài Whisper và bộ dịch phụ đề. Model tải ở lần sử dụng đầu tiên.")

    async def install_voice(self, job):
        target = self.root / "omnivoice-venv"
        await self.run_process([job["input"]["python"], "-m", "venv", str(target)], job)
        python = target / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        pip = [str(python), "-m", "pip", "install", "--disable-pip-version-check"]
        device = job["input"]["device"]
        args = ["torch==2.8.0", "torchaudio==2.8.0"]
        if device in ("cuda", "cpu"):
            args += ["--index-url", "https://download.pytorch.org/whl/" + ("cu128" if device == "cuda" else "cpu")]
        await self.run_process(pip + args, job)
        # Install the exact requested source revision without requiring Git on clients.
        await self.run_process(pip + ["https://github.com/k2-fsa/OmniVoice/archive/08be0b4ccbac3e13e374e86fbfead4b4cac343e2.zip"], job)
        await self.run_process([str(python), "-c", "from omnivoice import OmniVoice; print('OmniVoice import OK')"], job)
        self.settings.update(voicePython=str(python), device=device)
        self.store.put("settings", self.settings)
        self.update_job(job, state="done", progress=100, message="Đã cài và kiểm tra OmniVoice. Model sẽ tải ở lượt tạo giọng đầu tiên.")

    async def worker(self, kinds):
        while not self.closing:
            if self.require_google and not self.auth.ready:
                await asyncio.sleep(0.4)
                continue
            jobs = sorted((j for j in self.store.active_jobs() if j["state"] == "queued" and j["kind"] in kinds), key=lambda j: j["createdAt"])
            if not jobs:
                await asyncio.sleep(0.4)
                continue
            job = jobs[0]
            self.update_job(job, state="running", message="Đang xử lý")
            try:
                if job["kind"] == "scan":
                    await self.scan(job)
                elif job["kind"] == "search":
                    await self.search(job)
                elif job["kind"] == "download":
                    await self.download(job)
                elif job["kind"] == "dub":
                    await self.dub(job)
                elif job["kind"] == "transcribe":
                    await self.transcribe(job)
                elif job["kind"] == "install_asr":
                    await self.install_asr(job)
                elif job["kind"] == "guest":
                    await self.browser.open(job["input"]["url"])
                elif job["kind"] == "close_guest":
                    await self.browser.close()
                elif job["kind"] == "install_browser":
                    from playwright._impl._driver import compute_driver_executable
                    node, cli = compute_driver_executable()
                    async with self.browser.lock:
                        await self.browser.close()
                        self.browser.browsers_dir = self.root / "browsers"
                        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(self.browser.browsers_dir)
                        await self.run_process([node, cli, "install", "--no-shell", "chromium"], job)
                if job["state"] == "running":
                    self.update_job(job, state="done", progress=100, message="Hoàn tất")
            except asyncio.CancelledError:
                locked = self.require_google and not self.auth.ready
                self.update_job(job, state="interrupted" if self.closing or locked else "cancelled", message="Tạm dừng: cần đăng nhập Google." if locked else "Đã dừng")
                if self.closing or locked or asyncio.current_task().cancelling():
                    raise
            except Exception as error:
                self.update_job(job, state="blocked" if isinstance(error, GuestBlocked) else "error", message=str(error)[-2000:])
                channel_id = job["input"].get("channelId")
                channel = self.store.get("channels", channel_id) if channel_id else None
                if channel and job["kind"] == "scan":
                    failures = min(channel.get("failures", 0) + 1, 8)
                    channel.update(failures=failures, status=str(error)[:500], lastCheck=time.time())
                    if job["input"].get("monitor"):
                        channel["nextCheck"] = time.time() + min(3600, channel["interval"] * 2**failures)
                    self.store.put("channels", channel)

    async def scheduler(self):
        while not self.closing:
            if self.require_google and not self.auth.ready:
                await asyncio.sleep(2)
                continue
            active = {j["input"].get("channelId") for j in self.store.active_jobs()}
            for channel in self.store.all("channels"):
                if channel["monitor"] and (channel.get("nextCheck") or 0) <= time.time() and channel["id"] not in active:
                    self.queue("scan", {"url": channel["url"], "channelId": channel["id"], "monitor": True})
            await asyncio.sleep(2)

    async def lock_session(self):
        self.auth.clear()
        for job in self.store.active_jobs():
            if job["state"] == "running":
                self.cancelled.add(job["id"])
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        await self.browser.close()
        self.start_tasks()

    async def guard_session(self):
        while not self.closing:
            await asyncio.sleep(30)
            if self.auth.token:
                try:
                    await self.auth.verify(self.auth.token, force=True)
                except PermissionError:
                    # Stop every lane; pending jobs remain saved for a later login.
                    await self.lock_session()

    def start_tasks(self):
        self.tasks = [asyncio.create_task(self.worker({"scan", "search", "guest", "close_guest", "install_browser"})),
            asyncio.create_task(self.worker({"download"})), asyncio.create_task(self.worker({"download"})),
            asyncio.create_task(self.worker({"dub", "transcribe", "install_voice", "install_asr"})), asyncio.create_task(self.scheduler())]

    async def serve(self):
        self.start_tasks()
        guard = asyncio.create_task(self.guard_session()) if self.require_google else None
        try:
            while not self.closing:
                line = await asyncio.to_thread(sys.stdin.readline)
                if not line:
                    break
                identity = None
                try:
                    if len(line) > 2_000_000:
                        raise ValueError("Yêu cầu vượt dung lượng cho phép.")
                    request = json.loads(line)
                    identity = request.get("id")
                    command = request["command"]
                    if command == "lock_session":
                        await self.lock_session()
                        result = True
                    else:
                        if self.require_google and command != "shutdown":
                            try:
                                await self.auth.verify(request.get("accessToken"))
                            except PermissionError:
                                await self.lock_session()
                                raise
                        result = await self.dispatch(command, request.get("payload") or {})
                    response = {"id": identity, "result": result}
                except Exception as error:
                    response = {"id": identity, "error": str(error)}
                print(json.dumps(response, ensure_ascii=False), flush=True)
        finally:
            self.closing = True
            if guard:
                guard.cancel()
                await asyncio.gather(guard, return_exceptions=True)
            for task in self.tasks:
                task.cancel()
            await asyncio.gather(*self.tasks, return_exceptions=True)
            await self.browser.close()
            self.store.db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--require-google", action="store_true", default=True)
    parser.add_argument("--check-browser", action="store_true")
    options = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    if options.check_browser:
        async def check_browser():
            browser = GuestBrowser(options.data_dir)
            try:
                context = await browser.start(False)
                page = await context.new_page()
                await page.goto("data:text/html,<title>DTApp Chromium</title>")
                assert await page.title() == "DTApp Chromium"
                print(json.dumps({"chromium":True, "version":context.browser.version,
                    "bundled":browser.browsers_dir == Path(sys.executable).resolve().parent / "browsers"}))
            finally:
                await browser.close()
        asyncio.run(check_browser())
    else:
        asyncio.run(Engine(options.data_dir, require_google=options.require_google).serve())
