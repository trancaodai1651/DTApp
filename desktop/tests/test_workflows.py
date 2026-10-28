import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from dataclasses import dataclass
from unittest.mock import AsyncMock, Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine
from browser import GuestBrowser, GuestBlocked
from translate_runner import translated_captions, to_srt
from domain import parse_script
from transcribe_runner import bounded_segments

ZH = '1\n00:00:00,000 --> 00:00:02,000\n你好世界'
VI = '1\n00:00:00,000 --> 00:00:02,000\nXin chào thế giới'


class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env=patch.dict(os.environ)
        self.env.start()
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.engine=Engine(self.root)
        self.source=self.root/'source.mp4'
        self.source.write_bytes(b'source')
        self.engine.store.put('videos',{'id':'12345678901','file':str(self.source),'url':'https://www.douyin.com/video/12345678901','title':'test'})
        self.engine.settings['voicePython']=sys.executable
        self.engine.ensure_speech_runtime=AsyncMock()
        self.stages=[]
        async def process(args,job):
            script=Path(args[1]).name
            request=json.loads(Path(args[2]).read_text(encoding='utf-8'))
            self.stages.append(script)
            if script=='transcribe_runner.py':
                reference=self.root/'reference.wav'
                reference.write_bytes(b'original audio')
                Path(request['result']).write_text(json.dumps({'transcript':ZH,'detectedLanguage':'zh','referenceAudio':str(reference),'referenceText':'你好世界'}),encoding='utf-8')
            elif script=='translate_runner.py':
                self.assertEqual(request['sourceLanguage'],'zh')
                self.assertEqual(request['targetLanguage'],'vi')
                Path(request['result']).write_text(json.dumps({'transcript':VI}),encoding='utf-8')
            elif script=='voice_runner.py':
                self.assertEqual(request['language'],'vi')
                self.assertEqual(request['refText'],'你好世界')
                self.assertEqual(request['segments'][0]['start'],0)
                self.assertEqual(request['segments'][0]['end'],2)
                self.assertEqual(request['segments'][0]['text'],'Xin chào thế giới')
                Path(request['output']).write_bytes(b'new video'*300)
        self.engine.run_process=AsyncMock(side_effect=process)

    async def asyncTearDown(self):
        await self.engine.browser.close()
        self.engine.store.db.close()
        self.temp.cleanup()
        self.env.stop()

    async def test_audio_to_vietnamese_subtitle_to_voice_without_supplied_script(self):
        queued=await self.engine.dispatch('dub',{'videoId':'12345678901','fromAudio':True,'language':'vi','voiceMode':'narration','originalVolume':.25})
        job=self.engine.store.get('jobs',queued['jobId'])
        await self.engine.dub(job)
        self.assertEqual(self.stages,['transcribe_runner.py','translate_runner.py','voice_runner.py'])
        self.assertEqual(job['state'],'done')
        self.assertEqual(Path(job['subtitleFile']).read_text(encoding='utf-8'),VI)
        self.assertEqual(job['referenceText'],'你好世界')

    async def test_prepared_subtitle_for_same_video_and_language_is_reused(self):
        q=await self.engine.dispatch('transcribe',{'videoId':'12345678901','targetLanguage':'vi'})
        prepared=self.engine.store.get('jobs',q['jobId'])
        await self.engine.transcribe(prepared)
        self.stages.clear()
        q=await self.engine.dispatch('dub',{'videoId':'12345678901','fromAudio':True,'subtitleJobId':prepared['id'],'language':'vi'})
        await self.engine.dub(self.engine.store.get('jobs',q['jobId']))
        self.assertEqual(self.stages,['voice_runner.py'])

    async def test_single_video_scan_automatically_enqueues_download(self):
        self.engine.browser.collect=AsyncMock(return_value={'resolvedUrl':'https://www.douyin.com/video/12345678901','videos':[{'id':'12345678901','title':'test','isImage':False}], 'complete':True,'warning':''})
        # The existing file is removed from metadata to simulate a new video.
        self.engine.store.put('videos',{'id':'12345678901','file':''})
        q=await self.engine.dispatch('scan',{'url':'https://v.douyin.com/example','autoDownload':False})
        await self.engine.scan(self.engine.store.get('jobs',q['jobId']))
        self.assertEqual(len([j for j in self.engine.store.active_jobs() if j['kind']=='download']),1)

    async def test_browser_visibility_is_persisted(self):
        await self.engine.dispatch('save_settings',{'downloadDir':str(self.root/'downloads'),'voicePython':'','browserVisible':False})
        self.assertFalse(self.engine.browser.preferred_visible)
        other=Engine(self.root)
        try:
            self.assertFalse(other.settings['browserVisible'])
            self.assertFalse(other.browser.preferred_visible)
        finally:
            other.store.db.close()

    async def test_first_authenticated_snapshot_bootstraps_browser_only_once(self):
        self.engine.require_google=True
        self.engine.auth=Mock(ready=True)
        self.engine.browser.installed=Mock(return_value=False)
        await self.engine.dispatch('snapshot',{})
        await self.engine.dispatch('snapshot',{})
        self.assertEqual(len([j for j in self.engine.store.active_jobs() if j['kind']=='install_browser']),1)

    async def test_hidden_captcha_does_not_claim_to_wait_for_visible_user_action(self):
        self.engine.browser.search_challenge_visible=AsyncMock(return_value=True)
        self.engine.browser.visible=False
        with self.assertRaisesRegex(GuestBlocked,'chạy ngầm'):
            await self.engine.browser.wait_for_verification(Mock(),Mock(),lambda:False)

    def test_translation_preserves_all_timestamps(self):
        segments=parse_script(ZH)
        translated=translated_captions(segments,lambda text:'Xin chào thế giới')
        self.assertEqual([(s['start'],s['end']) for s in segments],[(s['start'],s['end']) for s in translated])
        self.assertEqual(to_srt(translated),VI)
        with self.assertRaises(RuntimeError):
            translated_captions(segments,lambda text:'')

    def test_asr_final_timestamp_is_bounded_to_audio_duration(self):
        @dataclass
        class Chunk:
            start: float
            end: float
            text: str
        result=bounded_segments([Chunk(0,1,'first'),Chunk(1,2.28,'last'),Chunk(2.5,3,'outside')],2.04)
        self.assertEqual([chunk.text for chunk in result],['first','last'])
        self.assertEqual(result[-1].end,2.04)

    def test_frozen_worker_uses_bundled_chromium_without_installing(self):
        binary=self.root/'bin/engine.exe'
        (binary.parent/'browsers/chromium-123').mkdir(parents=True)
        with patch.object(sys,'frozen',True,create=True), patch.object(sys,'executable',str(binary)):
            browser=GuestBrowser(self.root/'appdata')
            self.assertEqual(browser.browsers_dir,(binary.parent/'browsers').resolve())
            self.assertTrue(browser.installed())


if __name__=='__main__':
    unittest.main()
