"""Private acoustic/speaker drift diagnostics; scores are not identity proof."""
import json
import os
import pathlib
import sys

import psutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
if psutil.virtual_memory().available < 2 * 1024**3:
    raise RuntimeError("Need 2 GiB available RAM; leave user programs alone")
os.chdir(ROOT / ".runtime/GPT-SoVITS")
sys.path.insert(0, str(pathlib.Path.cwd() / "GPT_SoVITS"))
import torch
import torchaudio
import librosa
import numpy as np
import soundfile as sf
from sv import SV

torch.set_num_threads(2)
model = SV("cpu", False)


def inspect(path):
    audio, rate = sf.read(path, dtype="float32")
    tensor = torch.from_numpy(audio).unsqueeze(0)
    tensor = torchaudio.functional.resample(tensor, rate, 16000)
    with torch.no_grad():
        embedding = model.compute_embedding3(tensor).flatten()
        embedding = torch.nn.functional.normalize(embedding, dim=0)
    pitch = librosa.yin(audio, fmin=70, fmax=600, sr=rate)
    rms = librosa.feature.rms(y=audio)[0]
    voiced = pitch[rms > max(.001, np.max(rms) * .15)]
    return embedding, float(np.median(voiced)) if len(voiced) else None


config = json.loads((ROOT / "data/tts-config.json").read_text(encoding="utf-8"))
reference = config["profiles"][0]["references"]
generated_neutral, _ = inspect(ROOT / "artifacts/tts/neutral.wav")
anchor, _ = inspect(ROOT / "data/tts-references" / reference["neutral"]["file"])
results = []
for emotion, ref in reference.items():
    generated, pitch = inspect(ROOT / "artifacts/tts" / f"{emotion}.wav")
    source, _ = inspect(ROOT / "data/tts-references" / ref["file"])
    result = {"emotion": emotion, "medianPitchHz": pitch, "speakerCosineToOwnReference": float(generated @ source), "speakerCosineToNeutralReference": float(generated @ anchor), "speakerCosineToGeneratedNeutral": float(generated @ generated_neutral)}
    results.append(result)
    print(json.dumps(result), flush=True)
(ROOT / "artifacts/tts/acoustic-diagnostics.json").write_text(json.dumps({"warning": "Uncalibrated ERes2Net cosine and YIN pitch; cross-language emotion changes affect scores. Not Furina similarity or a listening assessment.", "results": results}, indent=2), encoding="utf-8")
