"""Fail-closed checks before requests reach the upstream model runtime."""
import io
import json
import pathlib
import wave

MAX_BODY = 32000
FIXED = {"text_lang": "zh", "text_split_method": "cut5", "batch_size": 1,
         "parallel_infer": False, "seed": 42, "media_type": "wav", "streaming_mode": False}
FIELDS = set(FIXED) | {"text", "ref_audio_path", "prompt_text", "prompt_lang", "speed_factor"}


def validate_payload(payload, data_dir):
    if not isinstance(payload, dict) or set(payload) != FIELDS:
        raise ValueError("Only the bounded project synthesis contract is allowed")
    if any(type(payload[k]) is not type(v) or payload[k] != v for k, v in FIXED.items()):
        raise ValueError("Unsupported synthesis controls")
    text, speed = payload["text"], payload["speed_factor"]
    if not isinstance(text, str) or not text.strip() or len(text) > 300:
        raise ValueError("Text must contain 1..300 characters")
    if type(speed) not in (int, float) or not .7 <= speed <= 1.3:
        raise ValueError("Speed must be 0.7..1.3")
    data_dir = pathlib.Path(data_dir).resolve(strict=True)
    config_file = data_dir / "tts-config.json"
    if config_file.resolve(strict=True) != config_file or config_file.stat().st_size > MAX_BODY:
        raise ValueError("Invalid registry path or size")
    registry = json.loads(config_file.read_text(encoding="utf-8"))
    references = data_dir / "tts-references"
    if references.resolve(strict=True) != references:
        raise ValueError("Reference directory cannot be redirected")
    supplied = payload["ref_audio_path"]
    if not isinstance(supplied, str) or not pathlib.Path(supplied).is_absolute():
        raise ValueError("Absolute registered reference required")
    lexical = pathlib.Path(supplied)
    if not lexical.is_relative_to(references) or ".." in lexical.parts:
        raise ValueError("Reference path must stay inside the registry")
    candidate = lexical.resolve(strict=True)
    if not candidate.is_relative_to(references) or not candidate.is_file():
        raise ValueError("Reference is outside the registry")
    profiles = registry.get("profiles")
    if not isinstance(profiles, list) or not 1 <= len(profiles) <= 12:
        raise ValueError("Invalid reference registry")
    matched = False
    for profile in profiles:
        if profile.get("usageAllowed") is not True or not profile.get("source") or not profile.get("license"):
            raise ValueError("Reference rights registration required")
        refs = profile.get("references", {})
        if "neutral" not in refs or not 1 <= len(refs) <= 6:
            raise ValueError("Invalid expression registry")
        for ref in refs.values():
            if profile.get("managed") and ref.get("speakerId") != profile.get("speakerId"):
                raise ValueError("Same speaker required")
            registered = (references / ref["file"]).resolve(strict=True)
            if not registered.is_relative_to(references):
                raise ValueError("Registered reference escapes data directory")
            if registered == candidate and payload["prompt_text"] == ref["text"] and payload["prompt_lang"] == ref["language"]:
                matched = True
    if not matched:
        raise ValueError("Reference and transcript must match the registered entry")
    if candidate.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Reference exceeds 4 MiB")
    audio = candidate.read_bytes()
    with wave.open(io.BytesIO(audio)) as wav:
        if wav.getsampwidth() != 2 or wav.getnchannels() not in (1, 2) or not 8000 <= wav.getframerate() <= 96000 or not 3 <= wav.getnframes() / wav.getframerate() <= 10:
            raise ValueError("Registered reference must be 3..10s PCM16 WAV")
        if len(wav.readframes(wav.getnframes())) != wav.getnframes() * wav.getnchannels() * 2:
            raise ValueError("Truncated reference audio")
    return payload
