"""Launch the unmodified official API with a no-compiler Windows compatibility shim."""
import argparse
import os
import pathlib
import runpy
import shutil
import sys
import hashlib

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9880)
    parser.add_argument("--cpu", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be 1024..65535")
    runtime = ROOT / ".runtime"
    repo = runtime / "GPT-SoVITS"
    (runtime / "nltk-data").mkdir(parents=True, exist_ok=True)
    os.environ["NLTK_DATA"] = str(runtime / "nltk-data")
    os.environ["HF_HOME"] = str(runtime / "hf-cache")
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    os.environ["OMP_NUM_THREADS"] = "2"
    import imageio_ffmpeg
    tools = runtime / "tools/ffmpeg"
    tools.mkdir(parents=True, exist_ok=True)
    target = tools / "ffmpeg.exe"
    if not target.exists():
        shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(), target)
    os.environ["PATH"] = str(tools) + os.pathsep + os.environ["PATH"]
    import jieba
    import jieba.posseg
    # Same documented segmentation API, without jieba_fast's C++ acceleration.
    sys.modules["jieba_fast"] = jieba
    sys.modules["jieba_fast.posseg"] = jieba.posseg
    import yaml
    config = {"custom": {
        "bert_base_path": "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large",
        "cnhuhbert_base_path": "GPT_SoVITS/pretrained_models/chinese-hubert-base",
        "device": "cpu" if args.cpu else "cuda", "is_half": not args.cpu,
        "t2s_weights_path": "GPT_SoVITS/pretrained_models/s1v3.ckpt",
        "version": "v2ProPlus", "vits_weights_path": "GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth",
    }}
    config_path = runtime / "tts-infer.yaml"
    config_path.write_text(yaml.safe_dump(config), encoding="utf-8")
    os.chdir(repo)
    sys.path.insert(0, str(repo))
    sys.path.insert(0, str(repo / "GPT_SoVITS"))
    sys.argv = [str(repo / "api_v2.py"), "-a", "127.0.0.1", "-p", str(args.port), "-c", str(config_path)]
    api = runpy.run_path(str(repo / "api_v2.py"), run_name="exo_tts_backend")
    app = api["APP"]
    from fastapi.responses import JSONResponse
    import uvicorn

    @app.middleware("http")
    async def local_boundary(request, call_next):
        host = request.headers.get("host", "")
        if host != f"127.0.0.1:{args.port}" or request.headers.get("origin") not in (None, f"http://{host}") or request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"error": "Local origin required"}, status_code=403)
        allowed = request.url.path in ("/openapi.json", "/health") and request.method == "GET"
        allowed |= request.url.path == "/tts" and request.method == "POST" and request.headers.get("content-type", "").startswith("application/json")
        if not allowed:
            return JSONResponse({"error": "This local service exposes only JSON synthesis"}, status_code=403)
        return await call_next(request)

    # Upstream control and arbitrary weight switching routes are unreachable.
    @app.get("/health")
    async def exo_health():
        return {"service": "project-exo-tts", "pid": os.getpid(), "rootId": hashlib.sha256(str(ROOT).lower().encode()).hexdigest(), "ready": True}

    uvicorn.run(app, host="127.0.0.1", port=args.port, workers=1, access_log=False)


if __name__ == "__main__":
    main()
