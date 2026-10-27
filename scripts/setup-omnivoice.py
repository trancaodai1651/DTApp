"""Install the requested upstream OmniVoice into an optional isolated environment."""
import argparse
from pathlib import Path
import platform
import subprocess
import sys
import venv

parser = argparse.ArgumentParser()
parser.add_argument("--device", choices=["cpu", "cuda", "mps"], default="mps" if sys.platform == "darwin" and platform.machine() == "arm64" else "cpu")
parser.add_argument("--path", default=str(Path(__file__).resolve().parents[1] / ".venv-omnivoice"))
args = parser.parse_args()
target = Path(args.path).expanduser().resolve()
if sys.platform == "darwin" and platform.machine() == "x86_64":
    raise SystemExit("OmniVoice requires recent PyTorch, which has no official Intel macOS wheel. The universal DT App supports downloading on Intel; local OmniVoice requires a compatible separately built PyTorch runtime.")
venv.create(target, with_pip=True)
python = target / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
def pip(*values):
    subprocess.run([str(python), "-m", "pip", "install", *values], check=True)
pip("--upgrade", "pip")
if args.device == "cuda":
    pip("torch==2.8.0", "torchaudio==2.8.0", "--index-url", "https://download.pytorch.org/whl/cu128")
elif args.device == "mps":
    pip("torch==2.8.0", "torchaudio==2.8.0")
else:
    pip("torch==2.8.0", "torchaudio==2.8.0", "--index-url", "https://download.pytorch.org/whl/cpu")
pip("git+https://github.com/k2-fsa/OmniVoice.git@08be0b4ccbac3e13e374e86fbfead4b4cac343e2")
subprocess.run([str(python), "-c", "from omnivoice import OmniVoice; print('OmniVoice import OK')"], check=True)
print("Select this Python in Douyin Studio Settings:")
print(python)
