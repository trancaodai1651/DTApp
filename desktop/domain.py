"""Pure validation shared by the media worker and its tests."""
from datetime import date, datetime, time, timedelta
import re
from urllib.parse import urlparse, parse_qs


def douyin_url(value):
    match = re.search(r"https://[^\s<>\[\]\"）)]+", str(value))
    if not match:
        raise ValueError("Dán link HTTPS Douyin hoặc nội dung chia sẻ có chứa link.")
    parsed = urlparse(match[0].rstrip(".,，"))
    if parsed.hostname not in {"douyin.com", "www.douyin.com", "v.douyin.com", "www.iesdouyin.com"} or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("Chỉ nhận link từ douyin.com hoặc v.douyin.com.")
    video_id = parse_qs(parsed.query).get("modal_id", [None])[0]
    if video_id and re.fullmatch(r"\d{10,24}", video_id):
        return f"https://www.douyin.com/video/{video_id}"
    return parsed.geturl().split("#")[0]


def video_id_from_url(url):
    match = re.search(r"/(?:video|note)/(\d{10,24})", url)
    return match[1] if match else None


def date_bounds(mode="all", anchor=None, end=None):
    """Inclusive calendar dates in the machine's local zone, exclusive upper bound."""
    if mode == "all":
        return None, None
    start = date.fromisoformat(anchor) if anchor else date.today()
    if mode == "week":
        start -= timedelta(days=start.weekday())
        stop = start + timedelta(days=7)
    elif mode == "month":
        start = start.replace(day=1)
        stop = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    elif mode == "day":
        stop = start + timedelta(days=1)
    elif mode == "range":
        stop = date.fromisoformat(end) + timedelta(days=1)
        if stop <= start:
            raise ValueError("Ngày kết thúc phải từ ngày bắt đầu trở đi.")
    else:
        raise ValueError("Khoảng thời gian không hợp lệ.")
    return datetime.combine(start, time()).timestamp(), datetime.combine(stop, time()).timestamp()


def in_period(video, bounds):
    start, stop = bounds
    if start is None:
        return True
    timestamp = video.get("createdAt")
    return isinstance(timestamp, (int, float)) and start <= timestamp < stop


def safe_name(value):
    result = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value)).strip(" .")[:90]
    if not result or result.upper().split(".")[0] in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
        result = "video_" + result
    return result


def parse_script(value):
    """Plain script or strictly ordered SRT; keep all segments, never silently crop."""
    value = str(value).strip()
    if not value or len(value) > 50000:
        raise ValueError("Nhập lời thoại hoặc SRT, tối đa 50.000 ký tự.")
    if "-->" not in value:
        return [{"text": value, "start": 0, "end": None}]
    segments = []
    pattern = re.compile(r"(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})")
    last = 0
    for block in re.split(r"\n\s*\n", value.replace("\r", "")):
        lines = block.splitlines()
        index = next((i for i, line in enumerate(lines) if "-->" in line), -1)
        match = pattern.fullmatch(lines[index].strip()) if index >= 0 else None
        if not match:
            raise ValueError("SRT có mốc thời gian không hợp lệ.")
        parts = list(map(int, match.groups()))
        if any(parts[i] > 59 for i in (1, 2, 5, 6)):
            raise ValueError("SRT có phút/giây không hợp lệ.")
        start = parts[0]*3600 + parts[1]*60 + parts[2] + parts[3]/1000
        stop = parts[4]*3600 + parts[5]*60 + parts[6] + parts[7]/1000
        text = re.sub(r"<[^>]*>", "", " ".join(lines[index+1:])).strip()
        if stop <= start or start < last or not text:
            raise ValueError("SRT cần lời thoại và các đoạn tăng dần, không chồng nhau.")
        segments.append({"text": text, "start": start, "end": stop})
        last = stop
    return segments


def aweme_records(payload):
    """Read both public post-list and detail payloads without retaining cookies."""
    found = {}
    def visit(item):
        if isinstance(item, list):
            for entry in item:
                visit(entry)
        elif isinstance(item, dict):
            identity = str(item.get("aweme_id", item.get("awemeId", "")))
            if identity.isdigit() and ("video" in item or "images" in item):
                author = item.get("author") or {}
                video = item.get("video") or {}
                address = video.get("play_addr") or video.get("playAddr") or {}
                urls = address.get("url_list", address.get("urlList", []))
                cover = video.get("cover") or {}
                found[identity] = {"id": identity, "title": item.get("desc", "") or identity,
                    "createdAt": item.get("create_time", item.get("createTime")),
                    "url": f"https://www.douyin.com/video/{identity}", "author": author.get("nickname", ""),
                    "secUid": author.get("sec_uid", author.get("secUid", "")),
                    "cover": (cover.get("url_list") or [""])[0], "mediaUrls": urls,
                    "duration": video.get("duration", 0)/1000, "isImage": bool(item.get("images")) and not urls}
                return
            for child in item.values():
                if isinstance(child, (dict, list)):
                    visit(child)
    visit(payload)
    return list(found.values())
