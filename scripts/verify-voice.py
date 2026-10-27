"""Run real OmniVoice on the downloaded user sample; retain evidence and output."""
import asyncio
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "desktop"))
from engine import Engine


async def main():
    engine = Engine(root / "artifacts/douyin-live")
    python = root / ".venv-omnivoice" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    engine.settings.update(voicePython=str(python), device="cuda" if sys.platform == "win32" else "auto")
    engine.store.put("settings", engine.settings)
    video = engine.snapshot()["videos"][0]
    queued = await engine.dispatch("dub", {"videoId":video["id"], "script":"1\n00:00:00,000 --> 00:00:08,000\nXin chào bạn! Hôm nay, chúng ta cùng gặp một người bạn nhỏ đáng yêu và khám phá câu chuyện thú vị này nhé.\n\n2\n00:00:08,000 --> 00:00:16,000\nMỗi khoảnh khắc đều mang đến niềm vui. Chúc bạn một ngày thật may mắn, bình an và tràn ngập tiếng cười.", "language":"vi", "originalVolume":0.1, "fast":True})
    worker = asyncio.create_task(engine.worker({"dub"}))
    last = ""
    try:
        while True:
            job = engine.store.get("jobs", queued["jobId"])
            if job["message"] != last:
                print(json.dumps({"state":job["state"], "message":job["message"]}, ensure_ascii=False), flush=True)
                last = job["message"]
            if job["state"] not in ("queued", "running"):
                break
            await asyncio.sleep(1)
        (root / "artifacts/douyin-live/voice-report.json").write_text(json.dumps({"job":job, "video":engine.store.get("videos", video["id"])}, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        engine.closing = True
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)
        engine.store.db.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
