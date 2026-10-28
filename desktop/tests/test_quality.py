import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from domain import aweme_records, merge_video_records
from engine import Engine, verify_download_quality


class QualityTests(unittest.TestCase):
    def test_address_dimensions_override_misleading_video_dimensions_and_keep_only_best_mirrors(self):
        result = aweme_records({'aweme_id':'12345678901', 'video':{'width':3840,'height':2160,
            'bit_rate':[
                {'bit_rate':9000000,'play_addr':{'width':1280,'height':720,'url_list':['https://v.douyinvod.com/low']}},
                {'bit_rate':4000000,'play_addr':{'width':3840,'height':2160,'url_list':['https://v.douyinvod.com/high','https://v.douyinvod.com/mirror']}},
            ], 'download_addr':{'width':1920,'height':1080,'url_list':['https://v.douyinvod.com/download']}}})[0]
        self.assertEqual((result['width'],result['height']), (3840,2160))
        self.assertEqual(result['mediaUrls'], ['https://v.douyinvod.com/high','https://v.douyinvod.com/mirror'])

    def test_all_codec_addresses_are_considered_and_bitrate_breaks_resolution_ties(self):
        result = aweme_records({'aweme_id':'12345678901', 'video':{'bit_rate':[
            {'width':1920,'height':1080,'bit_rate':100,'play_addr_265':{'url_list':['https://v.douyinvod.com/hevc']}},
            {'width':1920,'height':1080,'bit_rate':200,'play_addr_h264':{'url_list':['https://v.douyinvod.com/avc']}}
        ]}})[0]
        self.assertEqual(result['mediaUrls'], ['https://v.douyinvod.com/avc'])

    def test_later_preview_does_not_overwrite_detail_quality(self):
        high={'id':'12345678901','width':3840,'height':2160,'bitRate':4000,'mediaUrls':['high']}
        low={'id':'12345678901','width':720,'height':1280,'bitRate':1000,'mediaUrls':['low'],'title':'new title'}
        result=merge_video_records(high,low)
        self.assertEqual(result['mediaUrls'],['high'])
        self.assertEqual(result['title'],'new title')
        records=aweme_records([{'aweme_id':'12345678901','video':{'play_addr':{'width':3840,'height':2160,'url_list':['high']}}}, {'aweme_id':'12345678901','video':{'play_addr':{'width':720,'height':1280,'url_list':['low']}}}])
        self.assertEqual(records[0]['mediaUrls'], ['high'])

    def test_actual_lower_resolution_is_rejected(self):
        response=Mock(returncode=0,stderr=b'Stream #0:0: Video: h264, yuv420p, 1280x720, 30 fps')
        with patch('engine.subprocess.run', return_value=response):
            with self.assertRaisesRegex(RuntimeError,'không tự hạ'):
                verify_download_quality(Path('sample.mp4'),{'width':3840,'height':2160})


class DownloadQualityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env=patch.dict(os.environ)
        self.env.start()
        self.temp=tempfile.TemporaryDirectory()
        self.engine=Engine(self.temp.name)
        self.engine.settings['downloadDir']=str(Path(self.temp.name)/'downloads')
        self.engine.store.put('videos',{'id':'12345678901','url':'https://www.douyin.com/video/12345678901','title':'test','mediaUrls':['https://v.douyinvod.com/stale-low']})
        self.fresh={'id':'12345678901','width':3840,'height':2160,'bitRate':4000,'mediaUrls':['https://v.douyinvod.com/high']}
        self.engine.browser.collect=AsyncMock(return_value={'videos':[self.fresh]})
        page=Mock(evaluate=AsyncMock(return_value='fixture'),close=AsyncMock())
        context=Mock(new_page=AsyncMock(return_value=page),cookies=AsyncMock(return_value=[]))
        self.engine.browser.start=AsyncMock(return_value=context)
        queued=self.engine.queue('download',{'videoId':'12345678901'})
        self.job=self.engine.store.get('jobs',queued['jobId'])

    async def asyncTearDown(self):
        self.engine.store.db.close()
        self.temp.cleanup()
        self.env.stop()

    async def test_cached_preview_is_refreshed_and_actual_quality_is_saved(self):
        response=io.BytesIO(b'0000ftyp'+b'v'*2048)
        response.headers={'Content-Type':'video/mp4','Content-Length':str(len(response.getvalue()))}
        opener=Mock(open=Mock(return_value=response))
        with patch('engine.build_opener',return_value=opener), patch('engine.verify_download_quality',return_value=(3840,2160)):
            await self.engine.download(self.job)
        self.assertEqual(opener.open.call_args.args[0].full_url,'https://v.douyinvod.com/high')
        self.engine.browser.collect.assert_awaited_once()
        self.assertTrue(self.engine.store.get('videos','12345678901')['qualityVerified'])

    async def test_best_source_failure_does_not_fall_back_to_lower_cached_url(self):
        opener=Mock(open=Mock(side_effect=OSError('CDN unavailable')))
        with patch('engine.build_opener',return_value=opener):
            with self.assertRaisesRegex(RuntimeError,'CDN unavailable'):
                await self.engine.download(self.job)
        self.assertEqual([c.args[0].full_url for c in opener.open.call_args_list],['https://v.douyinvod.com/high']*2)
        self.assertFalse(self.engine.store.get('videos','12345678901').get('file'))

    async def test_force_redownload_preserves_old_file_if_best_source_fails(self):
        old=Path(self.temp.name)/'existing.mp4'
        old.write_bytes(b'keep old file')
        video=self.engine.store.get('videos','12345678901')
        self.engine.store.put('videos',{**video,'file':str(old)})
        self.job['input']['force']=True
        with patch('engine.build_opener',return_value=Mock(open=Mock(side_effect=OSError('offline')))):
            with self.assertRaises(RuntimeError):
                await self.engine.download(self.job)
        self.assertEqual(old.read_bytes(),b'keep old file')

    async def test_refresh_cannot_silently_lower_previously_known_quality(self):
        video=self.engine.store.get('videos','12345678901')
        self.engine.store.put('videos',{**video,'width':7680,'height':4320})
        with patch('engine.build_opener') as opener:
            with self.assertRaisesRegex(RuntimeError,'không|dừng tải'):
                await self.engine.download(self.job)
        opener.assert_not_called()


if __name__=='__main__':
    unittest.main()
