"""Build a relocatable private CPython + CPU speech stack, without model weights."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = "https://github.com/k2-fsa/OmniVoice/archive/08be0b4ccbac3e13e374e86fbfead4b4cac343e2.zip"
PACKAGES = [UPSTREAM, "transformers==5.21.0", "faster-whisper==1.2.1", "av<19"]
PROBE = "import json,sys,torch; from omnivoice import OmniVoice; from faster_whisper import WhisperModel; from transformers import AutoModelForCausalLM; print(json.dumps({'python':sys.version.split()[0],'torch':torch.__version__,'speech':True}))"


def prune_build_libraries(target):
    # Static link libraries are for compiling extensions, never inference.
    # PyTorch's Windows CPU wheel alone includes a 2.3 GB oneDNN .lib.
    libraries=target/('Lib/site-packages' if sys.platform=='win32' else 'lib/python3.12/site-packages')/'torch/lib'
    for pattern in ('*.lib','*.a'):
        for path in libraries.glob(pattern):
            assert path.resolve().is_relative_to(target.resolve())
            path.unlink()


def copy_msvc_runtime(target):
    if sys.platform!='win32':
        return
    locator=Path(os.environ.get('ProgramFiles(x86)','C:/Program Files (x86)'))/'Microsoft Visual Studio/Installer/vswhere.exe'
    installation=Path(subprocess.check_output([str(locator),'-latest','-products','*','-property','installationPath','-utf8'],encoding='utf-8').strip())
    folders=sorted(installation.glob('VC/Redist/MSVC/*/x64/Microsoft.VC*.CRT'))
    if not folders:
        raise RuntimeError('MSVC redistributable build files are required for the portable runtime')
    crt=folders[-1]
    for directory in (crt, *crt.parent.glob('Microsoft.VC*.OpenMP')):
        for dll in directory.glob('*.dll'):
            shutil.copy2(dll,target/dll.name)
    (target/'MSVC-REDIST-NOTICE.txt').write_text('Microsoft Visual C++ Runtime redistributable components. License: https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/\n',encoding='utf-8')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--arch',choices=['x86_64','aarch64'])
    args=parser.parse_args()
    arch='aarch64' if platform.machine().lower() in ('arm64','aarch64') else 'x86_64'
    if args.arch and args.arch!=arch:
        raise RuntimeError('Build the speech runtime on its native architecture')
    osname='windows' if sys.platform=='win32' else 'macos' if sys.platform=='darwin' else None
    if not osname:
        raise RuntimeError('Desktop speech bundle supports Windows and macOS')
    config=json.loads((ROOT/'desktop/python-runtime.json').read_text(encoding='utf-8'))
    asset=config['targets'][osname+'-'+arch]
    target=ROOT/'src-tauri/worker-runtime'/arch/'speech-runtime'
    manifest=target/'dt-speech-runtime.json'
    supported=not (osname=='macos' and arch=='x86_64')
    spec=hashlib.sha256(json.dumps([asset,PACKAGES,'torch2.8-cpu',supported],sort_keys=True).encode()).hexdigest()
    python=target/('python.exe' if osname=='windows' else 'bin/python3')
    env={k:v for k,v in os.environ.items() if k not in ('PYTHONHOME','PYTHONPATH')}
    env.update(PYTHONNOUSERSITE='1',HF_HUB_DISABLE_XET='1',PIP_DISABLE_PIP_VERSION_CHECK='1')
    if manifest.is_file() and json.loads(manifest.read_text())['spec']==spec:
        copy_msvc_runtime(target)
        prune_build_libraries(target)
        subprocess.run([str(python),'-c',PROBE if supported else 'import sys; print(sys.version)'],check=True,env=env)
        print('Bundled speech runtime is current',flush=True)
        return
    stage=ROOT/'artifacts/speech-runtime-build'/arch
    stage.mkdir(parents=True,exist_ok=True)
    archive=stage/'cpython.tar.gz'
    def checksum(path):
        digest=hashlib.sha256()
        with path.open('rb') as source:
            while chunk:=source.read(1024*1024):
                digest.update(chunk)
        return digest.hexdigest()
    if not archive.is_file() or checksum(archive)!=asset['sha256']:
        print('Downloading bundled CPython '+config['pythonVersion'],flush=True)
        with urlopen(Request(asset['url'],headers={'User-Agent':'DTApp-builder'}),timeout=60) as response,archive.open('wb') as output:
            shutil.copyfileobj(response,output,1024*1024)
    if checksum(archive)!=asset['sha256']:
        raise RuntimeError('CPython archive checksum mismatch')
    expanded=stage/'expanded'
    expanded.mkdir(exist_ok=True)
    with tarfile.open(archive) as package:
        package.extractall(expanded,filter='data')
    prepared=expanded/'python'
    executable=prepared/('python.exe' if osname=='windows' else 'bin/python3')
    pip=[str(executable),'-m','pip','install','--disable-pip-version-check','--no-cache-dir']
    if supported:
        torch=['torch==2.8.0','torchaudio==2.8.0']
        if osname=='windows':
            torch+=['--index-url','https://download.pytorch.org/whl/cpu']
        subprocess.run(pip+torch,check=True,env=env)
        subprocess.run(pip+PACKAGES,check=True,env=env)
    # The app only calls python -m pip; build-machine console-script shebangs
    # are never used after relocation.
    if target.exists():
        backup=ROOT/'artifacts/speech-runtime-backups'/arch
        backup.mkdir(parents=True,exist_ok=True)
        from uuid import uuid4
        assert target.resolve().is_relative_to((ROOT/'src-tauri/worker-runtime').resolve())
        assert backup.resolve().is_relative_to((ROOT/'artifacts').resolve())
        target.rename(backup/str(uuid4()))
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.move(str(prepared),str(target))
    copy_msvc_runtime(target)
    prune_build_libraries(target)
    # Import after moving: this catches absolute build-path dependencies.
    subprocess.run([str(python),'-c',PROBE if supported else 'import sys; print(sys.version)'],check=True,env=env)
    manifest.write_text(json.dumps({'schema':1,'spec':spec,'pythonVersion':config['pythonVersion'],
        'backend':'cpu' if osname=='windows' else 'mps' if supported else 'unsupported',
        'supported':supported,'arch':arch,'platform':osname},indent=2),encoding='utf-8')
    print('Private CPython and speech stack bundled: '+str(target),flush=True)


if __name__=='__main__':
    main()
