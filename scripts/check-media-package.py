"""Execute a frozen native worker without credentials and verify its auth boundary."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import platform
import sqlite3
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--binary")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
architecture = "aarch64" if platform.machine().lower() in ("aarch64", "arm64") else "x86_64"
name = "dt-media-engine.exe" if platform.system() == "Windows" else "dt-media-engine"
binary = Path(args.binary).resolve() if args.binary else root / "src-tauri/worker-runtime" / architecture / "dt-media-engine" / name
with tempfile.TemporaryDirectory(prefix="dtapp-package-check-") as directory:
    requests = [{"id":1,"command":"snapshot"},
        {"id":2,"command":"save_channel","payload":{"url":"https://www.douyin.com/user/test","name":"unauthorized"}},
        {"id":3,"command":"lock_session"}, {"id":4,"command":"shutdown"}]
    result = subprocess.run([str(binary), "--data-dir", directory],
        input="\n".join(json.dumps(v) for v in requests) + "\n", capture_output=True,
        encoding="utf-8", timeout=30)
    if result.returncode:
        raise RuntimeError(f"Native worker exited {result.returncode}: {result.stderr[-1600:]}")
    replies = [json.loads(line) for line in result.stdout.splitlines()]
    assert len(replies) == 4, "Worker JSON-lines protocol failed"
    assert "error" in replies[0] and "error" in replies[1], "Unauthenticated access was allowed"
    assert replies[2].get("result") is True and replies[3].get("result") is True
    with closing(sqlite3.connect(Path(directory) / "media.sqlite3")) as database:
        assert database.execute("SELECT COUNT(*) FROM channels").fetchone()[0] == 0
    print(json.dumps({"architecture":architecture, "nativeWorker":str(binary),
        "defaultRequiresGoogle":True, "unauthorizedWriteRejected":True, "shutdown":True}))
