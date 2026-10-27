"""Create an isolated, small media runtime for local desktop development."""
from pathlib import Path
import subprocess
import sys
import venv

root = Path(__file__).resolve().parents[1]
venv_path = root / ".venv-media"
venv.create(venv_path, with_pip=True)
python = venv_path / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
subprocess.run([str(python), "-m", "pip", "install", "-r", str(root / "desktop/requirements.txt"), "pyinstaller==6.22.3"], check=True)
print("Media runtime ready. Chromium can be installed from Douyin Studio Settings.")
