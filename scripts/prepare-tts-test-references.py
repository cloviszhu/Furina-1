"""Prepare six attributed RAVDESS clips for private, noncommercial local tests.

Source: Livingstone SR, Russo FA (2018), https://zenodo.org/records/1188976
License: CC BY-NC-SA 4.0. No audio/output is committed or publicly uploaded.
"""
import hashlib
import json
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = "https://zenodo.org/records/1188976/files/Audio_Speech_Actors_01-24.zip?download=1"
MD5 = "bc696df654c87fed845eb13823edef8a"


def main():
    archive_path = ROOT / ".runtime/ravdess-speech.zip"
    if not archive_path.exists() or hashlib.file_digest(archive_path.open("rb"), "md5").hexdigest() != MD5:
        digest = hashlib.md5()
        temporary = archive_path.with_suffix(".part")
        count = 0
        with urllib.request.urlopen(URL, timeout=90) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                count += len(chunk)
                if count > 250 * 1024**2:
                    raise RuntimeError("Reference archive exceeded 250 MiB bound")
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != MD5:
            raise RuntimeError("Reference archive checksum mismatch")
        temporary.replace(archive_path)
    directory = ROOT / "data/tts-references"
    directory.mkdir(parents=True, exist_ok=True)
    references = {}
    with zipfile.ZipFile(archive_path) as archive:
        for emotion, code in {"neutral": "01", "calm": "02", "happy": "03", "sad": "04", "angry": "05", "surprised": "08"}.items():
            name = f"03-01-{code}-01-01-01-24.wav"
            member = f"Actor_24/{name}"
            data = archive.read(member)
            (directory / name).write_bytes(data)
            references[emotion] = {"file": name, "language": "en", "text": "Kids are talking by the door."}
            print(emotion, len(data), hashlib.sha256(data).hexdigest(), flush=True)
    config = {"endpoint": "http://127.0.0.1:9880", "profiles": [{
        "id": "ravdess-24-test", "label": "女声 · RAVDESS 24 非商业测试（非芙宁娜）",
        "source": "Livingstone & Russo (2018), RAVDESS Actor 24 · https://zenodo.org/records/1188976",
        "license": "CC BY-NC-SA 4.0 · 仅本地非商业测试", "usageAllowed": True, "references": references,
    }]}
    # Refuse to overwrite user-owned registrations.
    target = ROOT / "data/tts-config.json"
    if target.exists():
        target = ROOT / "data/tts-test-config.json"
    target.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Test registration:", target.name, flush=True)


if __name__ == "__main__":
    main()
