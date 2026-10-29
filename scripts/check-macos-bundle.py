"""Check universal app architectures and execute the packaged native worker on macOS."""
from pathlib import Path
import platform
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
bundle_root = root / "src-tauri/target/universal-apple-darwin/release/bundle/macos"
apps = list(bundle_root.glob("*.app"))
assert len(apps) == 1, f"Expected one app, found {apps}"
app = apps[0]
architectures = subprocess.check_output(["lipo", "-archs", str(app / "Contents/MacOS/dtapp")], text=True).split()
assert {"x86_64", "arm64"}.issubset(architectures), architectures
workers = {}
for architecture in ("x86_64", "aarch64"):
    workers[architecture] = app / "Contents/Resources/worker-runtime" / architecture / "dt-media-engine/dt-media-engine"
    assert workers[architecture].is_file(), workers[architecture]
    worker_architectures = subprocess.check_output(["lipo", "-archs", str(workers[architecture])], text=True).split()
    assert ("arm64" if architecture == "aarch64" else "x86_64") in worker_architectures, worker_architectures
native = "aarch64" if platform.machine() == "arm64" else "x86_64"
subprocess.run([sys.executable, str(root / "scripts/check-media-package.py"), "--binary", str(workers[native])], check=True)
archive = bundle_root / "DT-App-0.2.9-macos-universal.zip"
subprocess.run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(app), str(archive)], check=True)
print(f"Universal app verified ({architectures}); portable archive: {archive}")
