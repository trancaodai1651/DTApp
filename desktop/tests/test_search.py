"""Search verification lifecycle and multilingual aggregation regressions."""
import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from browser import GuestBrowser, GuestBlocked, search_login_required
from engine import Engine


class SearchBrowserTests(unittest.IsolatedAsyncioTestCase):
    def test_real_search_login_wall_is_distinct_from_normal_login_navigation(self):
        self.assertTrue(search_login_required('登录后即可搜索更多精彩视频'))
        self.assertFalse(search_login_required('首页 视频 搜索 登录'))

    async def asyncSetUp(self):
        self.env = patch.dict(os.environ)
        self.env.start()
        self.temp = tempfile.TemporaryDirectory()
        self.browser = GuestBrowser(self.temp.name)
        self.page = Mock()
        self.page.is_closed.return_value = False
        self.page.title = AsyncMock(return_value="验证码中间页")
        self.page.bring_to_front = AsyncMock()
        self.page.wait_for_timeout = AsyncMock()
        self.page.close = AsyncMock()
        self.page.url = 'about:blank'
        async def navigate(url, **kwargs):
            self.page.url = url
        self.page.goto = AsyncMock(side_effect=navigate)
        self.context = Mock()
        self.context.new_page = AsyncMock(return_value=self.page)
        self.browser.start = AsyncMock(return_value=self.context)

    async def asyncTearDown(self):
        self.temp.cleanup()
        self.env.stop()

    async def test_timeout_retains_exact_tab_and_retry_does_not_reset_challenge(self):
        self.browser.wait_for_verification = AsyncMock(side_effect=GuestBlocked('waiting'))
        for _ in range(2):
            with self.assertRaises(GuestBlocked):
                await self.browser.search('木工DIY', Mock(), lambda:False)
        self.browser.start.assert_awaited_with(True)
        self.context.new_page.assert_awaited_once()
        self.page.goto.assert_awaited_once()
        self.page.close.assert_not_awaited()
        self.assertIs(self.browser.search_page, self.page)
        self.assertEqual(self.page.remove_listener.call_count, 2)

    async def test_verification_wait_resumes_when_challenge_disappears(self):
        self.browser.search_challenge_visible = AsyncMock(side_effect=[True, True, False])
        progress = Mock()
        resumed = await self.browser.wait_for_verification(self.page, progress, lambda:False, timeout=.01)
        self.assertTrue(resumed)
        progress.assert_called_once()
        self.page.bring_to_front.assert_awaited_once()

    async def test_manual_scan_retains_challenge_tab_for_retry(self):
        self.browser.wait_for_verification = AsyncMock(side_effect=GuestBlocked('waiting'))
        for _ in range(2):
            with self.assertRaises(GuestBlocked):
                await self.browser.collect('https://www.douyin.com/video/12345678901', Mock(), lambda:False, interactive=True)
        self.context.new_page.assert_awaited_once()
        self.page.goto.assert_awaited_once()
        self.page.close.assert_not_awaited()
        self.assertIs(self.browser.collect_page, self.page)

    async def test_verification_timeout_is_actionable_and_does_not_close_tab(self):
        with self.assertRaisesRegex(GuestBlocked, 'giữ mở'):
            await self.browser.wait_for_verification(self.page, Mock(), lambda:False, timeout=0)
        self.page.close.assert_not_awaited()

    async def test_cancel_stops_verification_wait(self):
        with self.assertRaises(asyncio.CancelledError):
            await self.browser.wait_for_verification(self.page, Mock(), lambda:True)

    async def test_closed_search_window_has_readable_error(self):
        self.page.is_closed.return_value = True
        with self.assertRaisesRegex(GuestBlocked, 'đã đóng'):
            await self.browser.search_challenge_visible(self.page)


class SearchAggregationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict(os.environ)
        self.env.start()
        self.temp = tempfile.TemporaryDirectory()
        self.engine = Engine(self.temp.name)
        self.engine.browser.search = AsyncMock()

    async def asyncTearDown(self):
        await self.engine.browser.close()
        self.engine.store.db.close()
        self.temp.cleanup()
        self.env.stop()

    async def run_search(self, queries):
        queued = await self.engine.dispatch('search', {'queries':queries})
        job = self.engine.store.get('jobs', queued['jobId'])
        await self.engine.search(job)
        return job

    async def test_three_unicode_queries_merge_without_duplicate_videos(self):
        self.engine.browser.search.side_effect = [
            {'videos':[{'id':'12345678901'}], 'warning':''},
            {'videos':[{'id':'12345678901'}, {'id':'12345678902'}], 'warning':''},
            {'videos':[], 'warning':''},
        ]
        job = await self.run_search([{'language':lang, 'query':query} for lang, query in [('vi','đồ gỗ'), ('en','woodworking'), ('zh','木工')]])
        self.assertEqual(job['state'], 'done')
        self.assertEqual(job['resultIds'], ['12345678901','12345678902'])
        self.assertEqual([call.args[0] for call in self.engine.browser.search.await_args_list], ['đồ gỗ','woodworking','木工'])

    async def test_legitimate_empty_results_are_not_reported_as_captcha(self):
        self.engine.browser.search.return_value = {'videos':[], 'warning':''}
        job = await self.run_search([{'language':'en','query':'no matches'}])
        self.assertEqual(job['state'], 'done')
        self.assertEqual(job['resultIds'], [])

    async def test_challenge_after_first_language_preserves_partial_results(self):
        self.engine.browser.search.side_effect = [{'videos':[{'id':'12345678901'}], 'warning':''}, GuestBlocked('CAPTCHA')]
        job = await self.run_search([{'language':'vi','query':'đồ gỗ'}, {'language':'zh','query':'木工'}])
        self.assertEqual(job['state'], 'partial')
        self.assertEqual(job['resultIds'], ['12345678901'])
        self.assertIn('CAPTCHA', job['message'])


if __name__ == '__main__':
    unittest.main()
