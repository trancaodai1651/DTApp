"""Validate DT App Google sessions against the existing Supabase project."""
import asyncio
import json
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PROJECT = "https://xpdosyzwdvfnxzwyjwur.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_EBTRELqnk_6QjoGmebV0GA_SxNSQY5h"


def google_user_id(user):
    identities = user.get("identities") or []
    if user.get("is_anonymous") or not user.get("email") or not any(i.get("provider") == "google" for i in identities):
        raise PermissionError("Cần đăng nhập Google để sử dụng DT App.")
    identity = user.get("id")
    if not isinstance(identity, str) or len(identity) != 36:
        raise PermissionError("Phiên Google không hợp lệ.")
    return identity


class GoogleSession:
    def __init__(self, fetch=None):
        self.token = ""
        self.user_id = None
        self.checked_at = 0
        self.lock = asyncio.Lock()
        self.fetch = fetch or self._fetch

    @property
    def ready(self):
        return bool(self.user_id and self.token and time.monotonic() - self.checked_at < 90)

    def clear(self):
        self.token = ""
        self.user_id = None
        self.checked_at = 0

    @staticmethod
    def _fetch(path, token):
        request = Request(PROJECT + path, headers={"apikey":PUBLISHABLE_KEY, "Authorization":"Bearer " + token})
        with urlopen(request, timeout=15) as response:
            return json.load(response)

    async def verify(self, token, force=False):
        async with self.lock:
            if not isinstance(token, str) or not token or len(token) > 16000:
                self.clear()
                raise PermissionError("Cần đăng nhập Google để sử dụng DT App.")
            if not force and token == self.token and self.ready and time.monotonic() - self.checked_at < 30:
                return self.user_id
            try:
                user = await asyncio.to_thread(self.fetch, "/auth/v1/user", token)
                identity = google_user_id(user)
                query = urlencode({"select":"email,is_active", "email":"eq." + user["email"].lower(), "limit":"1"})
                access = await asyncio.to_thread(self.fetch, "/rest/v1/app_users?" + query, token)
                if not isinstance(access, list) or not access or access[0].get("is_active") is not True or access[0].get("email", "").lower() != user["email"].lower():
                    raise PermissionError("Tài khoản Google chưa được cấp quyền dùng DT App.")
                self.token = token
                self.user_id = identity
                self.checked_at = time.monotonic()
                return identity
            except PermissionError:
                self.clear()
                raise
            except Exception as error:
                self.clear()
                # Do not forward URLs, headers or tokens into logs/job history.
                raise PermissionError("Không xác minh được phiên Google hoặc quyền truy cập. Đăng nhập lại và kiểm tra kết nối mạng.") from error
