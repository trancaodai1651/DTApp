import asyncio
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from auth import GoogleSession
from engine import Engine

USER = {"id":"12345678-1234-4234-8234-123456789abc", "email":"owner@example.test", "is_anonymous":False, "identities":[{"provider":"google"}]}


class AuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_missing_and_fake_sessions_without_persisting_tokens(self):
        auth = GoogleSession(fetch=lambda path, token: {})
        for token in (None, "", "invalid-token"):
            with self.assertRaises(PermissionError):
                await auth.verify(token)
            self.assertFalse(auth.ready)
            self.assertEqual(auth.token, "")

    async def test_google_and_allowlist_required_with_verified_session_cache(self):
        calls = []
        def fetch(path, token):
            calls.append(path)
            return USER if path == "/auth/v1/user" else [{"email":USER["email"], "is_active":True}]
        auth = GoogleSession(fetch)
        self.assertEqual(await auth.verify("test-session"), USER["id"])
        self.assertTrue(auth.ready)
        await auth.verify("test-session")
        self.assertEqual(len(calls), 2)
        auth.clear()
        self.assertFalse(auth.ready)
        for user in ({**USER,"is_anonymous":True}, {**USER,"identities":[{"provider":"email"}]}):
            auth = GoogleSession(lambda path, token: user)
            with self.assertRaises(PermissionError):
                await auth.verify("test-session")
        auth = GoogleSession(lambda path, token: USER if path == "/auth/v1/user" else [])
        with self.assertRaises(PermissionError):
            await auth.verify("test-session")

    async def test_auth_required_worker_does_not_start_saved_jobs_before_google_login(self):
        with tempfile.TemporaryDirectory() as path:
            engine = Engine(path, require_google=True)
            queued = engine.queue("download", {"videoId":"12345678901"})
            task = asyncio.create_task(engine.worker({"download"}))
            try:
                await asyncio.sleep(0.1)
                self.assertEqual(engine.store.get("jobs", queued["jobId"])["state"], "queued")
            finally:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
                engine.store.db.close()
