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
from app.services.tts_engine import build_pause_between, select_reference_clip, normalize_audio_ebu_r128, TTSEngine  # noqa: E402


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


def test_split_text_respects_max_chars():
    engine = TTSEngine.__new__(TTSEngine)
    long_text = "Ez egy nagyon hosszú mondat, amely meghaladja a maximális karakterszámot és ezért fel kell osztani több kisebb részre a helyes működéshez. " * 3
    chunks = engine._split_text(long_text, max_chars=220)
    assert all(len(c) <= 220 for c in chunks), f"Chunk too long: {max(len(c) for c in chunks)}"
    assert len(chunks) > 1


def test_split_text_handles_long_sentence_without_period():
    engine = TTSEngine.__new__(TTSEngine)
    # Single sentence with no period, exceeds limit — must be split at comma/word boundary
    text = "alma, körte, szilva, barack, málna, ribizli, eper, meggy, cseresznye, áfonya, szőlő, dinnye, görögdinnye, sárgabarack, őszibarack, mandarin, narancs, citrom, grapefruit"
    chunks = engine._split_text(text, max_chars=100)
    assert all(len(c) <= 100 for c in chunks)


def test_split_text_preserves_content():
    engine = TTSEngine.__new__(TTSEngine)
    text = "Első mondat. Második mondat! Harmadik mondat?"
    chunks = engine._split_text(text, max_chars=220)
    rejoined = " ".join(chunks)
    for phrase in ["Első mondat", "Második mondat", "Harmadik mondat"]:
        assert phrase in rejoined


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
