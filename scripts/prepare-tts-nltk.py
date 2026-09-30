"""Fetch official NLTK resources explicitly into the project runtime."""
import pathlib
import nltk

root = pathlib.Path(__file__).resolve().parents[1] / ".runtime/nltk-data"
root.mkdir(parents=True, exist_ok=True)
for package in ["cmudict", "averaged_perceptron_tagger", "averaged_perceptron_tagger_eng"]:
    if not nltk.download(package, download_dir=str(root), raise_on_error=True):
        raise RuntimeError(f"Unable to prepare {package}")
