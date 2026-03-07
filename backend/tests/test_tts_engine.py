import sys
from unittest.mock import MagicMock
from pathlib import Path

# Mock torch and TTS before importing tts_engine (not available in test venv)
for _mod in ["torch", "torch.backends", "torch.backends.mps", "TTS", "TTS.api"]:
    sys.modules.setdefault(_mod, MagicMock())

# Mock torch.backends.mps.is_available to return False
import torch  # noqa: E402 — this is the mock
torch.backends.mps.is_available.return_value = False

from unittest.mock import patch  # noqa: E402
from app.services.tts_engine import build_pause_between, select_reference_clip, normalize_audio_ebu_r128  # noqa: E402


def test_pause_dialogue_to_narration():
    ms = build_pause_between("dialogue", "narration")
    assert ms == 600


def test_pause_heading():
    ms = build_pause_between("heading", "narration")
    assert ms == 1500


def test_pause_default():
    ms = build_pause_between("narration", "narration")
    assert ms == 500


def test_select_matching_emotion():
    bank = {"neutral": "voices/neutral.wav", "sad": "voices/sad.wav"}
    result = select_reference_clip(bank, "sad", default="voices/neutral.wav")
    assert result == Path("voices/sad.wav")


def test_select_fallback_to_neutral():
    bank = {"neutral": "voices/neutral.wav"}
    result = select_reference_clip(bank, "tense", default="voices/neutral.wav")
    assert result == Path("voices/neutral.wav")


def test_select_fallback_to_default():
    bank = {}
    result = select_reference_clip(bank, "sad", default="voices/fallback.wav")
    assert result == Path("voices/fallback.wav")


def test_normalize_calls_ffmpeg(tmp_path):
    input_wav = tmp_path / "input.wav"
    input_wav.write_bytes(b"fake")
    output_wav = tmp_path / "output.wav"

    with patch("subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        normalize_audio_ebu_r128(input_wav, output_wav)
        assert mock_run.called
        cmd = mock_run.call_args[0][0]
        assert "ffmpeg-normalize" in cmd[0] or "ffmpeg-normalize" in " ".join(cmd)
