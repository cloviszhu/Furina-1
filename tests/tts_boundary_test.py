"""Standard library regressions, no model load or network requests."""
import copy
import importlib
import io
import json
import pathlib
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
boundary = importlib.import_module("tts-boundary")


class BoundaryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="exo-boundary-")
        self.data = pathlib.Path(self.temp.name).resolve()
        refs = self.data / "tts-references"
        refs.mkdir()
        wav = io.BytesIO()
        with wave.open(wav, "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(16000)
            f.writeframes(b"\x01\x00" * 51200)
        self.ref = refs / "test.wav"
        self.ref.write_bytes(wav.getvalue())
        self.registry = {"profiles": [{"usageAllowed": True, "source": "QA", "license": "QA only", "references": {
            "neutral": {"file": "test.wav", "text": "Test only.", "language": "en"}}}]}
        self.save()
        self.payload = dict(boundary.FIXED, text="Local QA.", speed_factor=1,
                            ref_audio_path=str(self.ref), prompt_text="Test only.", prompt_lang="en")

    def tearDown(self):
        self.temp.cleanup()

    def save(self):
        (self.data / "tts-config.json").write_text(json.dumps(self.registry), encoding="utf-8")

    def test_registered_contract(self):
        boundary.validate_payload(self.payload, self.data)

    def test_arbitrary_and_unregistered_paths(self):
        outside = self.data / "outside.wav"
        outside.write_bytes(self.ref.read_bytes())
        unregistered = self.ref.parent / "unregistered.wav"
        unregistered.write_bytes(self.ref.read_bytes())
        for path in [outside, unregistered, pathlib.Path("../test.wav")]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                boundary.validate_payload(dict(self.payload, ref_audio_path=str(path)), self.data)

    def test_controls_and_extra_fields(self):
        for changes in [{"batch_size": 999}, {"parallel_infer": True}, {"streaming_mode": True},
                        {"aux_ref_audio_paths": [str(self.ref)]}, {"sample_steps": 999},
                        {"media_type": "ogg"}, {"speed_factor": True}, {"speed_factor": float("nan")},
                        {"speed_factor": 5}, {"seed": True}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                boundary.validate_payload(dict(self.payload, **changes), self.data)

    def test_text_and_transcript(self):
        for changes in [{"text": ""}, {"text": "x" * 301}, {"text": []},
                        {"prompt_text": "different"}, {"prompt_lang": "zh"}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                boundary.validate_payload(dict(self.payload, **changes), self.data)

    def test_rights_and_same_speaker(self):
        original = copy.deepcopy(self.registry)
        for changes in [{"usageAllowed": False}, {"source": ""},
                        {"managed": True, "speakerId": "different"}]:
            self.registry = copy.deepcopy(original)
            self.registry["profiles"][0].update(changes)
            self.save()
            with self.assertRaises(ValueError):
                boundary.validate_payload(self.payload, self.data)

    def test_truncated_audio(self):
        self.ref.write_bytes(self.ref.read_bytes()[:-10])
        with self.assertRaises(ValueError):
            boundary.validate_payload(self.payload, self.data)


if __name__ == "__main__":
    unittest.main()
