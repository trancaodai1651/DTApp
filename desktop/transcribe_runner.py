"""Transcribe a downloaded Douyin video into an editable, time-aligned SRT."""
import json
from pathlib import Path
import subprocess
import sys

HIDDEN = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}


def run(args):
    result = subprocess.run(list(map(str, args)), capture_output=True,
        encoding="utf-8", errors="replace", **HIDDEN)
    if result.returncode:
        raise RuntimeError(result.stderr[-1800:] or "Không xử lý được audio của video.")
    return result


def srt_time(seconds):
    millis = max(0, round(float(seconds) * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    seconds, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def main(request):
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise RuntimeError("Chưa cài Whisper. Mở Cài đặt Douyin và bấm Cài nhận dạng lời nói.") from error

    source = Path(request["video"])
    work = Path(request["work"])
    work.mkdir(parents=True, exist_ok=True)
    audio = work / "source-audio.wav"
    print("Đang tách audio từ video gốc…", flush=True)
    run([request["ffmpeg"], "-hide_banner", "-loglevel", "error", "-y", "-i", source,
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio])

    model_dir = Path(request["modelDir"])
    model_dir.mkdir(parents=True, exist_ok=True)
    print("Đang tải/nạp Whisper small lần đầu có thể mất vài phút…", flush=True)
    model = WhisperModel("small", device="cpu", compute_type="int8",
        download_root=str(model_dir))
    chunks, info = model.transcribe(str(audio), beam_size=5, vad_filter=True,
        condition_on_previous_text=False)
    segments = list(chunks)
    if not segments:
        raise RuntimeError("Không nhận ra lời nói trong audio video.")

    captions = []
    for index, segment in enumerate(segments, 1):
        text = segment.text.strip()
        if text:
            captions.extend((str(index),
                f"{srt_time(segment.start)} --> {srt_time(segment.end)}", text, ""))
    if not captions:
        raise RuntimeError("Whisper không tạo được bản chép lời.")

    # Reuse a clean, representative speech segment as OmniVoice's reference
    # sample. The caption and extracted audio share the exact same timestamps.
    reference = max(segments, key=lambda segment: (1 if 2 <= segment.end-segment.start <= 18 else 0,
        min(segment.end-segment.start, 18)))
    reference_start = max(0, float(reference.start))
    reference_duration = max(0.5, float(reference.end) - reference_start)
    reference_path = work / "voice-reference.wav"
    run([request["ffmpeg"], "-hide_banner", "-loglevel", "error", "-y", "-ss",
        f"{reference_start:.3f}", "-i", source, "-t", f"{reference_duration:.3f}",
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", reference_path])

    result = {"transcript": "\n".join(captions).strip(),
        "detectedLanguage": getattr(info, "language", "") or "",
        "languageProbability": float(getattr(info, "language_probability", 0) or 0),
        "referenceAudio": str(reference_path), "referenceText": reference.text.strip()}
    Path(request["result"]).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"Đã chép lời {len(segments)} đoạn · ngôn ngữ {result['detectedLanguage'] or 'chưa xác định'}.", flush=True)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
