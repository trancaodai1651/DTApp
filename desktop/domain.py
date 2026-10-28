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
    def urls_for(address):
        if not isinstance(address, dict):
            return []
        urls = address.get("url_list", address.get("urlList", []))
        if isinstance(urls, str):
            return [urls]
        return [url for url in urls if isinstance(url, str)] if isinstance(urls, list) else []

    def quality_candidates(video):
        candidates = []
        def add(address, variant=None):
            if not isinstance(address, dict) or not urls_for(address):
                return
            variant = variant or {}
            def number(value):
                try:
                    return max(0, int(float(value)))
                except (TypeError, ValueError, OverflowError):
                    return 0
            width = number(address.get("width") or variant.get("width") or video.get("width"))
            height = number(address.get("height") or variant.get("height") or video.get("height"))
            bitrate = number(variant.get("bit_rate", variant.get("bitRate", address.get("bit_rate", 0))))
            candidates.append(((width * height, bitrate), urls_for(address), width, height, bitrate))

        address_names = ("play_addr", "playAddr", "play_addr_265", "play_addr_h264", "play_addr_bytevc1", "play_addr_bytevc2")
        variants = video.get("bit_rate", video.get("bitRate", [])) or []
        if isinstance(variants, dict):
            variants = [variants]
        if isinstance(variants, list):
            for variant in variants:
                if isinstance(variant, dict):
                    for name in address_names:
                        add(variant.get(name), variant)
        for name in (*address_names, "download_addr", "downloadAddr"):
            add(video.get(name))
        if not candidates:
            return [], (0, 0, 0)
        best_score = max(item[0] for item in candidates)
        # Mirrors of the highest tier only. Never silently download a lower tier.
        urls = list(dict.fromkeys(url for score, addresses, *_ in candidates if score == best_score for url in addresses))
        best = next(item for item in candidates if item[0] == best_score)
        return urls, best[2:]

    def visit(item):
        if isinstance(item, list):
            for entry in item:
                visit(entry)
        elif isinstance(item, dict):
            identity = str(item.get("aweme_id", item.get("awemeId", "")))
            if identity.isdigit() and ("video" in item or "images" in item):
                author = item.get("author") or {}
                video = item.get("video") or {}
                urls, quality = quality_candidates(video)
                cover = video.get("cover") or {}
                record = {"id": identity, "title": item.get("desc", "") or identity,
                    "createdAt": item.get("create_time", item.get("createTime")),
                    "url": f"https://www.douyin.com/video/{identity}", "author": author.get("nickname", ""),
                    "secUid": author.get("sec_uid", author.get("secUid", "")),
                    "cover": (cover.get("url_list") or [""])[0], "mediaUrls": urls,
                    "width": quality[0], "height": quality[1], "bitRate": quality[2],
                    "duration": video.get("duration", 0)/1000, "isImage": bool(item.get("images")) and not urls}
                found[identity] = merge_video_records(found.get(identity), record)
                return
            for child in item.values():
                if isinstance(child, (dict, list)):
                    visit(child)
    visit(payload)
    return list(found.values())


def video_quality(video):
    return ((video.get("width") or 0) * (video.get("height") or 0), video.get("bitRate") or 0)


def merge_video_records(previous, incoming):
    if not previous:
        return incoming
    merged = {**previous, **{key:value for key,value in incoming.items() if value is not None and value != ""}}
    if previous.get("mediaUrls") and (not incoming.get("mediaUrls") or video_quality(previous) > video_quality(incoming)):
        for key in ("mediaUrls", "width", "height", "bitRate"):
            merged[key] = previous.get(key)
    return merged
