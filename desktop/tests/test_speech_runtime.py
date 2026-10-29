import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from speech_runtime import SpeechRuntime, interpreter, MANIFEST
from engine import Engine


def bundle(folder, backend='cpu', supported=True):
    python=interpreter(folder)
    python.parent.mkdir(parents=True, exist_ok=True)
    python.touch()
    (folder/MANIFEST).write_text(json.dumps({'schema':1,'backend':backend,'supported':supported}),encoding='utf-8')
    return python


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)

    def test_frozen_ignores_stale_system_python_and_finds_sibling_runtime(self):
        executable=self.root/'resources/x86_64/dt-media-engine/engine.exe'
        expected=bundle(executable.parent.parent/'speech-runtime')
        with patch.object(sys,'frozen',True,create=True),patch.object(sys,'executable',str(executable)):
            runtime=SpeechRuntime(self.root/'data')
            self.assertEqual(runtime.selected('auto',sys.executable),expected.resolve())
            self.assertTrue(runtime.status()['ready'])

    def test_cpu_bypasses_managed_cuda_and_auto_uses_ready_cuda(self):
        runtime=SpeechRuntime(self.root/'data',self.root/'bundle')
        cpu=bundle(runtime.bundle)
        cuda=bundle(runtime.managed,'cuda')
        self.assertEqual(runtime.selected('cpu'),cpu)
        self.assertEqual(runtime.selected('auto'),cuda)
        # A copied but unverified CPU staging tree must not be selected as CUDA.
        bundle(runtime.managed,'cpu')
        self.assertEqual(runtime.selected('auto'),cpu)

    def test_missing_bundle_and_unsupported_intel_have_distinct_status(self):
        runtime=SpeechRuntime(self.root/'data',self.root/'bundle')
        self.assertFalse(runtime.status()['ready'])
        self.assertIn('bản đầy đủ',runtime.status()['message'])
        bundle(runtime.bundle,'unsupported',False)
        self.assertFalse(runtime.status()['supported'])
        self.assertIn('Mac Intel',runtime.status()['message'])

    def test_subprocess_does_not_inherit_external_python_packages(self):
        with patch.dict('os.environ',{'PYTHONHOME':'external','PYTHONPATH':'external'}):
            env=SpeechRuntime(self.root).environment()
        self.assertNotIn('PYTHONHOME',env)
        self.assertNotIn('PYTHONPATH',env)
        self.assertEqual(env['PYTHONNOUSERSITE'],'1')


class ProvisionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.engine=Engine(self.root/'data')
        self.engine.speech=SpeechRuntime(self.root/'data',self.root/'bundle')
        self.python=bundle(self.engine.speech.bundle)
        self.engine.settings.update(voicePython='',device='auto')
        self.job=self.engine.queue('install_voice',{})
        self.job=self.engine.store.get('jobs',self.job['jobId'])

    async def asyncTearDown(self):
        await self.engine.browser.close()
        self.engine.store.db.close()
        self.temp.cleanup()

    async def test_settings_ignore_old_python_picker_payload(self):
        with patch.object(sys,'frozen',True,create=True):
            await self.engine.dispatch('save_settings',{'downloadDir':str(self.root/'downloads'),'voicePython':'X:/old/python.exe','device':'cpu'})
        self.assertEqual(self.engine.settings['voicePython'],str(self.python))

    async def test_install_voice_command_does_not_require_python_parameter(self):
        result=await self.engine.dispatch('install_voice',{'device':'cpu'})
        self.assertEqual(self.engine.store.get('jobs',result['jobId'])['input'],{'device':'cpu'})

    async def test_automatic_cuda_failure_falls_back_cpu_but_explicit_cuda_reports_error(self):
        self.engine.prepare_cuda_runtime=AsyncMock(side_effect=RuntimeError('download failed'))
        with patch.object(self.engine.speech,'nvidia_available',return_value=True),patch.object(sys,'platform','win32'):
            self.assertEqual(await self.engine.ensure_voice_runtime(self.job),str(self.python))
            self.assertTrue(self.engine.speech.cuda_failed)
            self.engine.settings['device']='cuda'
            with self.assertRaisesRegex(RuntimeError,'download failed'):
                await self.engine.ensure_voice_runtime(self.job)

    async def test_cuda_ready_marker_is_written_only_after_relocated_probe(self):
        calls=[]
        async def run(args,job):
            calls.append(args)
            if Path(args[0])==interpreter(self.engine.speech.managed):
                self.assertEqual(self.engine.speech.manifest(self.engine.speech.managed)['backend'],'cpu')
        self.engine.run_process=AsyncMock(side_effect=run)
        await self.engine.prepare_cuda_runtime(self.job)
        self.assertEqual(self.engine.speech.manifest(self.engine.speech.managed)['backend'],'cuda')
        self.assertEqual(len(calls),4)


if __name__=='__main__':
    unittest.main()
