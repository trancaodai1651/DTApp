"""Extract native resources and release the large, task-owned transport TARs."""
from pathlib import Path
import tarfile

root=Path(__file__).resolve().parents[1]
downloads=root/'artifacts/worker-downloads'
target=root/'src-tauri/worker-runtime'
target.mkdir(parents=True,exist_ok=True)
archives=list(downloads.glob('media-*.tar'))
if not archives:
    raise RuntimeError('No worker archives were downloaded')
for archive in archives:
    assert archive.resolve().is_relative_to(downloads.resolve())
    with tarfile.open(archive) as package:
        package.extractall(target,filter='data')
    archive.unlink()
