"""Freeze only Playwright/FFmpeg. Never bundle PyTorch or model checkpoints."""
import argparse
from pathlib import Path
import platform
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--arch", choices=["x86_64", "aarch64"])
args = parser.parse_args()
native = "aarch64" if platform.machine().lower() in ("arm64", "aarch64") else "x86_64"
if args.arch and args.arch != native:
    raise SystemExit("Build each Python worker on its native architecture, then combine resources for the universal app.")
venv_python = root / ".venv-media" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
python = str(venv_python) if venv_python.exists() else sys.executable
subprocess.run([python, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--name", "dt-media-engine",
    "--distpath", str(root / "src-tauri/worker-runtime" / native),
    "--workpath", str(root / "artifacts/media-pyinstaller" / native),
    "--specpath", str(root / "artifacts/media-pyinstaller"),
    "--paths", str(root / "desktop"), "--collect-all", "playwright", "--collect-all", "imageio_ffmpeg",
    "--add-data", str(root / "desktop/voice_runner.py") + ":.",
    "--add-data", str(root / "desktop/transcribe_runner.py") + ":.",
    "--add-data", str(root / "desktop/translate_runner.py") + ":.", str(root / "desktop/engine.py")], check=True)

# Include the matching full Chromium in every native installer; one binary serves
# both visible mode and Chromium's new headless mode.
browsers = root / "src-tauri/worker-runtime" / native / "dt-media-engine/browsers"
subprocess.run([python, "-m", "playwright", "install", "--no-shell", "chromium"],
    env={**os.environ, "PLAYWRIGHT_BROWSERS_PATH":str(browsers)}, check=True)
