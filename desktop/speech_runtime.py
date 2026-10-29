"""Find application-owned Python; never depend on a system Python in a release."""
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

MANIFEST = 'dt-speech-runtime.json'
HIDDEN = {'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}


def interpreter(root):
    return Path(root)/('python.exe' if os.name=='nt' else 'bin/python3')


class SpeechRuntime:
    def __init__(self, data_root, bundle=None):
        self.root=Path(data_root).resolve()
        arch='aarch64' if platform.machine().lower() in ('arm64','aarch64') else 'x86_64'
        self.bundle=Path(bundle).resolve() if bundle else (
            Path(sys.executable).resolve().parent.parent/'speech-runtime' if getattr(sys,'frozen',False)
            else Path(__file__).resolve().parents[1]/'src-tauri/worker-runtime'/arch/'speech-runtime')
        self.managed=self.root/'voice-runtime-cuda'
        self.cuda_failed=False

    def manifest(self, folder):
        try:
            value=json.loads((folder/MANIFEST).read_text(encoding='utf-8'))
            return value if value.get('schema')==1 and interpreter(folder).is_file() else None
        except (OSError,ValueError):
            return None

    def legacy_development_python(self, value):
        if getattr(sys,'frozen',False) or not value or not Path(value).is_file():
            return None
        path=Path(value).resolve()
        if path.is_relative_to(self.bundle) or path.is_relative_to(self.root):
            return None
        return path

    def selected(self, device='auto', legacy=''):
        development=self.legacy_development_python(legacy)
        if development:
            return development
        accelerated=self.manifest(self.managed)
        if device!='cpu' and accelerated and accelerated.get('backend')=='cuda' and accelerated.get('supported'):
            return interpreter(self.managed)
        bundled=self.manifest(self.bundle)
        return interpreter(self.bundle) if bundled and bundled.get('supported') else None

    def status(self, device='auto', legacy=''):
        manifest=self.manifest(self.bundle)
        python=self.selected(device,legacy)
        unsupported=bool(manifest and not manifest.get('supported'))
        message=('Python và OmniVoice tích hợp đã sẵn sàng.' if python else
            'OmniVoice chưa hỗ trợ Mac Intel với bộ PyTorch hiện tại. Các công cụ tải video vẫn sử dụng được.' if unsupported else
            'Bộ cài thiếu môi trường giọng tích hợp. Cài lại bản đầy đủ của DT App.')
        return {'ready':bool(python), 'supported':not unsupported, 'message':message,
            'python':str(python) if python else '', 'bundled':bool(manifest),
            'backend':'cuda' if python and python==interpreter(self.managed) else manifest.get('backend','development') if manifest else 'development',
            'cudaSupported':sys.platform=='win32'}

    def environment(self):
        env={k:v for k,v in os.environ.items() if k not in ('PYTHONHOME','PYTHONPATH')}
        env.update(PYTHONNOUSERSITE='1', HF_HUB_DISABLE_XET='1', HF_HUB_DISABLE_IMPLICIT_TOKEN='1')
        return env

    def nvidia_available(self):
        if sys.platform!='win32':
            return False
        try:
            check=subprocess.run(['nvidia-smi','--query-gpu=driver_version','--format=csv,noheader'],
                capture_output=True,text=True,timeout=5,**HIDDEN)
            return check.returncode==0 and int(check.stdout.strip().split('.')[0])>=570
        except (OSError,ValueError,subprocess.TimeoutExpired):
            return False
