import asyncio
from datetime import datetime
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from domain import aweme_records, date_bounds, douyin_url, in_period, parse_script, safe_name
from engine import Engine, check_media_url


class DomainTests(unittest.TestCase):
    def test_user_supplied_urls(self):
        self.assertEqual(douyin_url("https://v.douyin.com/aIfhanErl6g"), "https://v.douyin.com/aIfhanErl6g")
        self.assertEqual(douyin_url("https://www.douyin.com/jingxuan?modal_id=7681298667634390739"), "https://www.douyin.com/video/7681298667634390739")
        self.assertEqual(douyin_url("复制打开抖音 https://v.douyin.com/aIfhanErl6g/ 看作品"), "https://v.douyin.com/aIfhanErl6g/")
        for value in ("https://douyin.com.evil.test/", "http://douyin.com/", "https://user:pass@douyin.com/", "https://douyin.com:1234/"):
            with self.assertRaises(ValueError):
                douyin_url(value)

    def test_calendar_periods_inclusive_end_and_leap_year(self):
        start, stop = date_bounds("week", "2026-10-27")
        self.assertEqual(datetime.fromtimestamp(start).date().isoformat(), "2026-10-26")
        self.assertEqual(datetime.fromtimestamp(stop).date().isoformat(), "2026-11-02")
        start, stop = date_bounds("month", "2024-02-29")
        self.assertEqual(datetime.fromtimestamp(stop).date().isoformat(), "2024-03-01")
        self.assertTrue(in_period({"createdAt":stop-1}, (start,stop)))
        self.assertFalse(in_period({"createdAt":stop}, (start,stop)))
        self.assertFalse(in_period({"createdAt":None}, (start,stop)))
        start, stop = date_bounds("range", "2026-10-27", "2026-10-27")
        self.assertEqual(datetime.fromtimestamp(stop).date().isoformat(), "2026-10-28")

    def test_srt_validation_and_plain_script(self):
        self.assertEqual(parse_script("Xin chào")[0]["end"], None)
        segments = parse_script("1\n00:00:01,000 --> 00:00:03,500\nXin chào\n\n2\n00:00:04,000 --> 00:00:05,000\nTạm biệt")
        self.assertEqual(segments[0]["start"], 1)
        self.assertEqual(segments[1]["end"], 5)
        for value in ("", "1\n00:00:03,000 --> 00:00:01,000\nLỗi", "1\n00:00:00,000 --> 00:00:03,000\nA\n\n2\n00:00:01,000 --> 00:00:04,000\nB"):
            with self.assertRaises(ValueError):
                parse_script(value)

    def test_public_payload_and_images(self):
        result = aweme_records({"aweme_list":[{"aweme_id":"7681298667634390739", "create_time":1234, "desc":"test", "author":{"nickname":"test", "sec_uid":"MS4wTest"}, "video":{"duration":10000, "play_addr":{"url_list":["https://v.douyinvod.com/test.mp4"]}}}]})
        self.assertEqual(result[0]["duration"], 10)
        self.assertEqual(result[0]["secUid"], "MS4wTest")
        self.assertFalse(result[0]["isImage"])
        self.assertTrue(aweme_records({"aweme_id":"12345678901", "images":[{}]})[0]["isImage"])

    def test_paths_and_cdn_restriction(self):
        self.assertNotIn("/", safe_name("../CON/a<>x"))
        self.assertTrue(safe_name("CON").startswith("video_"))
        check_media_url("https://v1.douyinvod.com/video.mp4")
        for url in ("http://v1.douyinvod.com/", "https://127.0.0.1/", "https://v1.douyinvod.com.evil.test/x"):
            with self.assertRaises(ValueError):
                check_media_url(url)


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = Engine(self.temp.name)

    async def asyncTearDown(self):
        await self.engine.browser.close()
        self.engine.store.db.close()
        self.temp.cleanup()

    async def test_bookmarks_persist_and_monitor_requires_channel_url(self):
        c = await self.engine.dispatch("save_channel", {"name":"Tham khảo", "url":"https://www.douyin.com/video/7681298667634390739", "notes":"ý tưởng"})
        with self.assertRaises(ValueError):
            await self.engine.dispatch("monitor", {"id":c["id"], "enabled":True})
        updated = await self.engine.dispatch("save_channel", {**c, "url":"https://www.douyin.com/user/MS4wTest"})
        await self.engine.dispatch("monitor", {"id":c["id"], "enabled":True, "interval":30})
        initial_since = self.engine.store.get("channels", c["id"])["monitorSince"]
        await self.engine.dispatch("monitor", {"id":c["id"], "enabled":True, "interval":60})
        self.assertEqual(self.engine.store.get("channels", c["id"])["monitorSince"], initial_since)
        other = Engine(self.temp.name)
        try:
            self.assertEqual(other.snapshot()["channels"][0]["notes"], "ý tưởng")
        finally:
            other.store.db.close()

    async def test_deduplication_and_retry_after_missing_file(self):
        self.engine.store.put("videos", {"id":"12345678901", "file":"", "isImage":False})
        self.assertEqual(self.engine.enqueue_downloads(["12345678901"])["queued"], 1)
        self.assertEqual(self.engine.enqueue_downloads(["12345678901"])["queued"], 0)
        job = self.engine.store.all("jobs")[0]
        await self.engine.dispatch("cancel", {"id":job["id"]})
        self.assertEqual(self.engine.enqueue_downloads(["12345678901"])["queued"], 1)

    async def test_monitor_partial_page_retains_watermark_and_downloads_unseen(self):
        c = self.engine.save_channel({"url":"https://www.douyin.com/user/MS4wTest", "name":"test"})
        await self.engine.dispatch("monitor", {"id":c["id"], "enabled":True, "interval":30})
        since = self.engine.store.get("channels", c["id"])["monitorSince"]
        outer = self
        class FakeBrowser:
            async def collect(self, *args, **kwargs):
                kwargs["on_videos"]([{"id":"12345678901", "secUid":"MS4wTest", "createdAt":since+1, "mediaUrls":[], "author":"test", "title":"new"}])
                # A new post must enter the download queue before pagination completes.
                active_downloads = [j for j in outer.engine.store.active_jobs() if j["kind"] == "download"]
                outer.assertEqual(len(active_downloads), 1)
                outer.assertEqual(kwargs["since"], since)
                return {"complete":False, "warning":"Chưa hết trang", "videos":[{"id":"12345678901", "createdAt":since+1, "mediaUrls":[], "author":"test", "title":"new"}, {"id":"12345678902", "createdAt":since-1000, "mediaUrls":[], "author":"test", "title":"old"}]}
            async def close(self):
                pass
        self.engine.browser = FakeBrowser()
        queued = self.engine.queue("scan", {"url":c["url"], "channelId":c["id"], "monitor":True})
        job = self.engine.store.get("jobs", queued["jobId"])
        await self.engine.scan(job)
        self.assertEqual(job["state"], "partial")
        self.assertEqual(self.engine.store.get("channels", c["id"])["monitorSince"], since)
        downloads = [j for j in self.engine.store.all("jobs") if j["kind"] == "download"]
        self.assertEqual([j["input"]["videoId"] for j in downloads], ["12345678901"])

    async def test_restart_marks_interrupted_and_rejects_unknown_commands(self):
        queued = self.engine.queue("scan", {"url":"https://www.douyin.com/"})
        job = self.engine.store.get("jobs", queued["jobId"])
        self.engine.update_job(job, state="running")
        restarted = Engine(self.temp.name)
        try:
            self.assertEqual(restarted.store.get("jobs", job["id"])["state"], "interrupted")
        finally:
            restarted.store.db.close()
        with self.assertRaises(ValueError):
            await self.engine.dispatch("execute_arbitrary_command", {})

    async def test_cancel_cannot_be_overwritten_by_a_late_progress_callback(self):
        queued = self.engine.queue("download", {"videoId":"12345678901"})
        running = self.engine.store.get("jobs", queued["jobId"])
        self.engine.update_job(running, state="running")
        await self.engine.dispatch("cancel", {"id":running["id"]})
        self.engine.update_job(running, progress=50, message="late chunk")
        self.assertEqual(self.engine.store.get("jobs", running["id"])["state"], "cancelled")

    async def test_scheduler_deduplicates_checks_and_removing_bookmark_retains_files(self):
        channel = self.engine.save_channel({"url":"https://www.douyin.com/user/MS4wTest", "name":"test"})
        await self.engine.dispatch("monitor", {"id":channel["id"], "enabled":True, "interval":30})
        task = asyncio.create_task(self.engine.scheduler())
        try:
            await asyncio.sleep(0.05)
            self.assertEqual(len(self.engine.store.active_jobs()), 1)
            await asyncio.sleep(2.05)
            self.assertEqual(len(self.engine.store.active_jobs()), 1)
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        video_path = Path(self.temp.name)/"keep.mp4"
        video_path.write_bytes(b"keep")
        self.engine.store.put("videos", {"id":"12345678901", "channelId":channel["id"], "file":str(video_path)})
        await self.engine.dispatch("remove_channel", {"id":channel["id"]})
        self.assertTrue(video_path.exists())
        self.assertIsNotNone(self.engine.store.get("videos", "12345678901"))


if __name__ == "__main__":
    unittest.main()
