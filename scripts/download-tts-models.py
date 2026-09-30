"""Download the official inference subset, pinned and verified; no credentials."""
import hashlib
import json
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT / ".runtime/GPT-SoVITS"
MODEL_REV = "336b2ec4e8d4ac74740798dd40af44e74659ecaf"
G2PW_REV = "0c47645e02a7bc3688d7b263b0042c81e3cd82cd"
LIMIT = 6 * 1024**3


def metadata(repo, revision):
    with urllib.request.urlopen(f"https://huggingface.co/api/models/{repo}/revision/{revision}?blobs=true", timeout=60) as response:
        return json.load(response)


def download(url, target, expected=None, max_bytes=2 * 1024**3):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and expected and hashlib.file_digest(target.open("rb"), "sha256").hexdigest() == expected:
        print("Verified existing", target.name, flush=True)
        return target.stat().st_size
    temporary = target.with_suffix(target.suffix + ".part")
    digest = hashlib.sha256()
    size = 0
    with urllib.request.urlopen(url, timeout=90) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                raise RuntimeError("Download exceeds configured bound")
            output.write(chunk)
            digest.update(chunk)
    if expected and digest.hexdigest() != expected:
        raise RuntimeError(f"Checksum mismatch: {target.name}")
    temporary.replace(target)
    print("Downloaded", target.name, size, digest.hexdigest(), flush=True)
    return size


def main():
    manifest = []
    total = 0
    for repo, revision in [("lj1995/GPT-SoVITS", MODEL_REV), ("XXXXRT/GPT-SoVITS-Pretrained", G2PW_REV)]:
        info = metadata(repo, revision)
        for item in info["siblings"]:
            name = item["rfilename"]
            selected = name in ["s1v3.ckpt", "v2Pro/s2Gv2ProPlus.pth", "sv/pretrained_eres2netv2w24s4ep4.ckpt", "G2PWModel.zip"] or name.startswith(("chinese-hubert-base/", "chinese-roberta-wwm-ext-large/"))
            if not selected:
                continue
            size = item.get("size", 0)
            total += size
            if total > LIMIT:
                raise RuntimeError("Model subset exceeds 6 GiB budget")
            target = (REPO / "GPT_SoVITS/text" if name == "G2PWModel.zip" else REPO / "GPT_SoVITS/pretrained_models") / name
            sha = item.get("lfs", {}).get("sha256")
            actual = download(f"https://huggingface.co/{repo}/resolve/{revision}/{name}", target, sha)
            manifest.append({"repo": repo, "revision": revision, "file": name, "bytes": actual, "sha256": hashlib.file_digest(target.open("rb"), "sha256").hexdigest()})
            if name == "G2PWModel.zip":
                with zipfile.ZipFile(target) as archive:
                    destination = (REPO / "GPT_SoVITS/text").resolve()
                    for member in archive.infolist():
                        path = (destination / member.filename).resolve()
                        if not path.is_relative_to(destination):
                            raise RuntimeError("Archive path escape")
                    archive.extractall(destination)
    (ROOT / ".runtime/model-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Subset download complete", total, flush=True)


if __name__ == "__main__":
    main()
