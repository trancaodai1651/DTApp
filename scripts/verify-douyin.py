"""Exercise the real application worker with the two user-supplied public links."""
import asyncio
import json
from pathlib import Path
import sys
import time

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "desktop"))
from engine import Engine


async def main():
    engine = Engine(root / "artifacts/douyin-live")
    workers = [asyncio.create_task(engine.worker({"scan"})), asyncio.create_task(engine.worker({"download"}))]
    report = []
    try:
        for url in ["https://v.douyin.com/aIfhanErl6g", "https://www.douyin.com/jingxuan?modal_id=7681298667634390739"]:
            queued = await engine.dispatch("scan", {"url":url, "autoDownload":True})
            last = ""
            while True:
                job = engine.store.get("jobs", queued["jobId"])
                if job["message"] != last:
                    print(json.dumps({"url":url, "state":job["state"], "message":job["message"]}, ensure_ascii=False), flush=True)
                    last = job["message"]
                if job["state"] not in ("queued", "running"):
                    report.append({"url":url, "scan":job})
                    break
                await asyncio.sleep(1)
        deadline = time.time() + 180
        while time.time() < deadline and any(j["kind"] == "download" and j["state"] in ("queued", "running") for j in engine.store.all("jobs")):
            await asyncio.sleep(1)
        snapshot = engine.snapshot()
        (root / "artifacts/douyin-live/report.json").write_text(json.dumps({"results":report, "snapshot":snapshot}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"channels":len(snapshot["channels"]), "videos":len(snapshot["videos"]), "jobs":snapshot["jobs"]}, ensure_ascii=False), flush=True)
    finally:
        engine.closing = True
        for worker in workers:
            worker.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
        await engine.browser.close()
        engine.store.db.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
