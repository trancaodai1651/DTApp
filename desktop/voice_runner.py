"""Runs in an optional OmniVoice environment, outside the lightweight app worker."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import wave

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
HIDDEN = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def run(args):
    result = subprocess.run(list(map(str, args)), capture_output=True, encoding="utf-8", errors="replace", **HIDDEN)
    if result.returncode:
        raise RuntimeError(result.stderr[-1800:])
    return result


def atempo(ratio):
    factors = []
    while ratio > 2:
        factors.append(2)
        ratio /= 2
    while ratio < 0.5:
        factors.append(0.5)
        ratio /= 0.5
    factors.append(ratio)
    return ",".join(f"atempo={factor:.8f}" for factor in factors)


def synthesize(request):
    import torch
    import soundfile as sf
    from omnivoice import OmniVoice
    from omnivoice.utils.common import get_best_device
    device = request["device"]
    if device == "auto":
        device = str(get_best_device())
    print(f"Đang nạp OmniVoice trên {device}; lần đầu cần tải model.", flush=True)
    model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device,
        dtype=torch.float32 if device == "cpu" else torch.float16)
    work = Path(request["work"])
    reference = None
    if request.get("refAudio"):
        reference = work / "reference.wav"
        run([request["ffmpeg"], "-hide_banner", "-loglevel", "error", "-y", "-i", request["refAudio"],
            "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", reference])
    generated = []
    for index, segment in enumerate(request["segments"]):
        print(f"Tạo giọng {index + 1}/{len(request['segments'])}", flush=True)
        kwargs = {"text": segment["text"], "language": request.get("language") or "vi",
            "num_step": 16 if request.get("fast") else 32}
        if reference:
            kwargs.update(ref_audio=str(reference), ref_text=request["refText"])
        elif request.get("instruct", "").strip():
            kwargs["instruct"] = request["instruct"].strip()
        audio = model.generate(**kwargs)[0]
        if hasattr(audio, "detach"):
            audio = audio.detach().cpu().numpy()
        output = work / f"voice-{index:05}.wav"
        sf.write(output, audio, model.sampling_rate)
        generated.append(output)
    return generated


def mux(request, generated):
    """Align every SRT segment or fit the entire script; copy original video stream."""
    import soundfile as sf
    ffmpeg, source = request["ffmpeg"], request["video"]
    probe = subprocess.run([ffmpeg, "-hide_banner", "-i", source], capture_output=True, encoding="utf-8", errors="replace", **HIDDEN)
    metadata = probe.stderr
    duration_match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", metadata)
    if not duration_match:
        raise RuntimeError("Không đọc được thời lượng video gốc.")
    hours, minutes, seconds = map(float, duration_match.groups())
    duration = hours*3600 + minutes*60 + seconds
    if duration <= 0:
        raise RuntimeError("Thời lượng video phải lớn hơn 0.")
    rate = 48000
    work = Path(request["work"])
    timeline = work / "narration.wav"
    def silence(writer, samples):
        while samples > 0:
            count = min(rate, samples)
            writer.writeframesraw(bytes(count*2))
            samples -= count
    with wave.open(str(timeline), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(rate)
        cursor = 0
        for index, (segment, audio) in enumerate(zip(request["segments"], generated, strict=True)):
            stop = segment["end"] if segment["end"] is not None else duration
            if stop > duration + 0.05:
                raise ValueError("SRT vượt quá thời lượng video. Chỉnh mốc thời gian trước khi xuất.")
            start_samples = round(segment["start"] * rate)
            end_samples = min(round(stop*rate), round(duration*rate))
            silence(writer, start_samples-cursor)
            target_duration = (end_samples-start_samples)/rate
            ratio = sf.info(str(audio)).duration / target_duration
            if not 0.25 <= ratio <= 4:
                raise ValueError(f"Đoạn {index+1} cần đổi tốc độ {ratio:.1f} lần. Rút gọn lời hoặc giãn SRT để giữ giọng tự nhiên.")
            aligned = work / f"aligned-{index:05}.wav"
            run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", audio,
                "-af", f"{atempo(ratio)},apad,atrim=duration={target_duration:.8f}",
                "-ar", str(rate), "-ac", "1", "-c:a", "pcm_s16le", aligned])
            with wave.open(str(aligned), "rb") as reader:
                while chunk := reader.readframes(rate):
                    writer.writeframesraw(chunk)
            cursor = end_samples
        silence(writer, round(duration*rate)-cursor)
    volume = float(request.get("originalVolume", 0))
    voice_mode = request.get("voiceMode", "narration")
    args = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-i", timeline]
    if voice_mode == "narration" and volume > 0 and re.search(r"Stream #\S+.*Audio:", metadata):
        args += ["-filter_complex", f"[0:a:0]volume={volume}[original];[original][1:a:0]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[a]", "-map", "0:v:0", "-map", "[a]"]
    else:
        args += ["-map", "0:v:0", "-map", "1:a:0"]
    temporary = str(request["output"]) + ".part.mp4"
    args += ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{duration:.6f}",
        "-map_metadata", "0", "-movflags", "+faststart+use_metadata_tags", temporary]
    print("Đang ghép giọng và giữ nguyên luồng hình gốc…", flush=True)
    run(args)
    Path(temporary).replace(request["output"])


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    mux(request, synthesize(request))
    print("Hoàn tất", flush=True)
