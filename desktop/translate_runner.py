"""Translate speech-derived captions locally while preserving every time span."""
import json
import re
from pathlib import Path
import sys
from transcribe_runner import srt_time

MODEL = "Qwen/Qwen3-4B-Instruct-2507"


def translated_captions(segments, translate):
    output = []
    for segment in segments:
        text = translate(segment["text"]).strip()
        if not text:
            raise RuntimeError("Bộ dịch trả lời rỗng; chưa tạo giọng để tránh thiếu nội dung.")
        output.append({**segment, "text":text})
    return output


def translation_valid(text, target):
    if not text or '<think>' in text or '-->' in text:
        return False
    if target in ('vi', 'en') and re.search(r'[\u3400-\u9fff]', text):
        return False
    if target == 'vi' and len(text.split()) > 3 and not re.search(r'[^\x00-\x7f]', text):
        return False
    return True


def to_srt(segments):
    return "\n\n".join(f"{i}\n{srt_time(s['start'])} --> {srt_time(s['end'])}\n{s['text']}" for i,s in enumerate(segments,1))


def main(request):
    import os
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    source, target = request["sourceLanguage"], request["targetLanguage"]
    names = {"vi":"Vietnamese", "en":"English", "zh":"Chinese", "ja":"Japanese", "ko":"Korean"}
    print(f"Đang tải/nạp model dịch {source} → {target}; lần đầu có thể mất vài phút…", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, cache_dir=request["modelDir"])
    preference = request.get("device", "auto")
    device = "cuda" if preference in ("auto", "cuda") and torch.cuda.is_available() else "mps" if preference in ("auto", "mps") and torch.backends.mps.is_available() else "cpu"
    from transformers import BitsAndBytesConfig
    if device == "cuda":
        model = AutoModelForCausalLM.from_pretrained(MODEL, cache_dir=request["modelDir"], device_map={"":0},
            quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16), dtype=torch.float16).eval()
    else:
        model = AutoModelForCausalLM.from_pretrained(MODEL, cache_dir=request["modelDir"], dtype=torch.float32 if device == "cpu" else torch.float16).to(device).eval()
    index = 0
    def translate(text):
        nonlocal index
        segment = {"text":text}
        # Keep each source cue isolated so the model cannot narrate adjacent
        # context inside this cue's timestamp.
        messages = [{"role":"system", "content":f"You are a professional subtitle translator. Translate the user's text faithfully into {names.get(target,target)}. Return only the translation. Do not add explanations or transliterate entire sentences."},
            {"role":"user", "content":segment["text"]}]
        if source == "zh" and target == "vi":
            messages = [{"role":"system", "content":"你是专业中越字幕翻译。把用户给出的中文原文完整翻译成自然的越南语，忠实保留原意，不增添内容。只返回越南语译文，不能返回中文或汉语拼音，不要解释。"},
                {"role":"user", "content":segment["text"]}]
        target_name = names.get(target,target)

        text = ""
        for attempt in range(2):
            inputs = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                enable_thinking=False, return_tensors="pt", return_dict=True).to(device)
            if inputs["input_ids"].shape[-1] > 4096:
                raise RuntimeError("Một đoạn phụ đề quá dài để dịch đầy đủ. Chia nhỏ đoạn rồi thử lại.")
            with torch.inference_mode():
                generated = model.generate(**inputs, max_new_tokens=384, do_sample=False)
            tokens = generated[0,inputs["input_ids"].shape[-1]:]
            if tokens[-1].item() != tokenizer.eos_token_id:
                raise RuntimeError("Bản dịch chạm giới hạn độ dài. Chia nhỏ phụ đề rồi thử lại.")
            text = tokenizer.decode(tokens, skip_special_tokens=True).strip()
            if translation_valid(text, target):
                break
            messages += [{"role":"assistant","content":text}, {"role":"user","content":f"Translate the original subtitle into {target_name}. Your reply must contain only the translation, without any Chinese characters or explanations."}]
        if not translation_valid(text, target):
            raise RuntimeError(f"Đoạn phụ đề {index+1} chưa được dịch đúng ngôn ngữ. Hãy tạo/xem phụ đề để kiểm tra trước khi tạo giọng.")
        index += 1
        print(f"Đang dịch phụ đề {index}/{len(request['segments'])}…", flush=True)
        return text
    output = translated_captions(request["segments"], translate)
    Path(request["result"]).write_text(json.dumps({"transcript":to_srt(output), "segments":output}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
