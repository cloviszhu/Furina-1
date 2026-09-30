"""Real, private short-sentence baseline against the official local TTS API."""
import argparse
import hashlib
import io
import json
import pathlib
import subprocess
import threading
import time
import urllib.request
import wave

import numpy as np
import psutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEXT = "终于见到你了。这一幕，就让我们一起写下去吧。"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--count", type=int, default=1, choices=[1, 6])
    args = parser.parse_args()
    process = psutil.Process(args.pid)
    if not any("run-local-tts.py" in part for part in process.cmdline()):
        raise RuntimeError("Refusing to monitor/stop an unrelated process")
    config = json.loads((ROOT / "data/tts-config.json").read_text(encoding="utf-8"))
    profile = config["profiles"][0]
    directory = ROOT / "artifacts/tts"
    directory.mkdir(parents=True, exist_ok=True)
    results = []
    for emotion, reference in list(profile["references"].items())[:args.count]:
        samples = []
        done = threading.Event()

        def monitor():
            while not done.is_set():
                try:
                    free = psutil.virtual_memory().available / 1024**2
                    gpu = int(subprocess.check_output(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"], creationflags=subprocess.CREATE_NO_WINDOW).decode().strip())
                    samples.append({"rssMiB": process.memory_info().rss / 1024**2, "availableMiB": free, "gpuTotalUsedMiB": gpu})
                    if free < 500 or gpu > 7700:
                        process.terminate()
                        print("Stopped only project TTS: resource guard", flush=True)
                        break
                except psutil.NoSuchProcess:
                    break
                done.wait(.5)

        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
        payload = {"text": TEXT, "text_lang": "zh", "ref_audio_path": str(ROOT / "data/tts-references" / reference["file"]), "prompt_text": reference["text"], "prompt_lang": reference["language"], "text_split_method": "cut5", "batch_size": 1, "parallel_infer": False, "speed_factor": 1, "seed": 42, "media_type": "wav", "streaming_mode": False}
        started = time.perf_counter()
        try:
            request = urllib.request.Request(config["endpoint"] + "/tts", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=120) as response:
                first_byte = time.perf_counter() - started
                audio = response.read(16 * 1024**2 + 1)
            if len(audio) > 16 * 1024**2:
                raise RuntimeError("Audio exceeds limit")
            elapsed = time.perf_counter() - started
            with wave.open(io.BytesIO(audio)) as waveform:
                rate = waveform.getframerate()
                duration = waveform.getnframes() / rate
                pcm = np.frombuffer(waveform.readframes(waveform.getnframes()), dtype=np.int16).astype(np.float64) / 32768
            (directory / f"{emotion}.wav").write_bytes(audio)
            result = {"emotion": emotion, "reference": reference["file"], "text": TEXT, "firstByteSeconds": first_byte, "totalSeconds": elapsed, "audioSeconds": duration, "sampleRate": rate, "bytes": len(audio), "sha256": hashlib.sha256(audio).hexdigest(), "peakAmplitude": float(np.max(np.abs(pcm))), "rms": float(np.sqrt(np.mean(pcm**2))), "clippedFraction": float(np.mean(np.abs(pcm) > .999)), "rssPeakMiB": max((s["rssMiB"] for s in samples), default=None), "availableMinMiB": min((s["availableMiB"] for s in samples), default=None), "gpuTotalUsedPeakMiB": max((s["gpuTotalUsedMiB"] for s in samples), default=None)}
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
        finally:
            done.set()
            thread.join(timeout=2)
            (directory / f"baseline-{args.count}.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
