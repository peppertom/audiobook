"""XTTS-v2 Text-to-Speech engine."""
import os
import subprocess
import wave
import torch
from pathlib import Path

# Auto-accept Coqui TTS license (CPML non-commercial)
os.environ["COQUI_TOS_AGREED"] = "1"

# PyTorch 2.6+ defaults weights_only=True which breaks TTS model loading.
# Monkey-patch torch.load to use weights_only=False for TTS compatibility.
_original_torch_load = torch.load


def _patched_torch_load(*args, **kwargs):
    if "weights_only" not in kwargs:
        kwargs["weights_only"] = False
    return _original_torch_load(*args, **kwargs)


torch.load = _patched_torch_load

from TTS.api import TTS

# --- Audio utilities (torch-free, usable in tests) ---

PAUSE_MS = {
    ("dialogue", "narration"): 600,
    ("narration", "dialogue"): 300,
    ("heading", "narration"): 1500,
    ("heading", "dialogue"): 1500,
    ("action", "narration"): 200,
    ("action", "dialogue"): 200,
}
DEFAULT_PAUSE_MS = 500


def build_pause_between(prev_type: str, next_type: str) -> int:
    """Return calibrated pause in milliseconds between two segment types."""
    return PAUSE_MS.get((prev_type, next_type), DEFAULT_PAUSE_MS)


EMOTION_FALLBACK = {
    "tense": "neutral",
    "angry": "tense",
    "whisper": "sad",
    "happy": "neutral",
}


def select_reference_clip(emotion_bank: dict, emotion: str, default: str) -> Path:
    """Select the best matching reference clip from emotion bank."""
    if emotion in emotion_bank:
        return Path(emotion_bank[emotion])
    fallback_emotion = EMOTION_FALLBACK.get(emotion, "neutral")
    if fallback_emotion in emotion_bank:
        return Path(emotion_bank[fallback_emotion])
    if "neutral" in emotion_bank:
        return Path(emotion_bank["neutral"])
    return Path(default)


def normalize_audio_ebu_r128(input_path: Path, output_path: Path) -> Path:
    """Normalize audio to audiobook standard: -18 LUFS, True Peak -1.5 dBTP."""
    subprocess.run(
        [
            "ffmpeg-normalize", str(input_path),
            "-o", str(output_path),
            "--loudness-range-target", "7",
            "--target-level", "-18",
            "--true-peak", "-1.5",
            "--audio-codec", "pcm_s16le",
            "-f",
        ],
        check=True,
        capture_output=True,
    )
    return output_path


class TTSEngine:
    def __init__(self):
        self.model = None
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"

    def load_model(self):
        """Load XTTS-v2 model into memory."""
        self.model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(self.device)

    @staticmethod
    def _get_wav_duration(path: Path) -> float:
        """Get duration of a WAV file in seconds."""
        with wave.open(str(path), "rb") as wf:
            return wf.getnframes() / wf.getframerate()

    def generate(self, text: str, reference_clip: Path, output_path: Path, language: str = "hu", on_progress=None) -> tuple[Path, list[dict]]:
        """Generate speech audio from text using a reference voice clip.

        on_progress: callback(event, chunk_index, total_chunks, chunk_word_counts, **kw)
            event: "chunk_start" or "chunk_done"
            chunk_word_counts: list[int] with word count per chunk

        Returns:
            (output_path, timing_data) where timing_data is a list of
            {"start": float, "end": float, "text": str} per chunk.
        """
        if not self.model:
            raise RuntimeError("TTS model not loaded. Call load_model() first.")

        # XTTS-v2 hard limit: 400 tokens. Hungarian is ~1 char/token so
        # keep chunks well under 250 chars to stay safe.
        chunks = self._split_text(text, max_chars=220)
        chunk_word_counts = [len(c.split()) for c in chunks]
        chunk_paths = []
        chunk_durations = []

        for i, chunk in enumerate(chunks):
            if on_progress:
                on_progress("chunk_start", i, len(chunks), chunk_word_counts, preview=chunk[:80])
            chunk_path = output_path.parent / f"{output_path.stem}_chunk_{i}.wav"
            self.model.tts_to_file(
                text=chunk,
                speaker_wav=str(reference_clip),
                language=language,
                file_path=str(chunk_path),
            )
            chunk_paths.append(chunk_path)
            chunk_durations.append(self._get_wav_duration(chunk_path))
            if on_progress:
                on_progress("chunk_done", i, len(chunks), chunk_word_counts)

        # Build timing data
        timing_data = []
        elapsed = 0.0
        for chunk_text, dur in zip(chunks, chunk_durations):
            timing_data.append({
                "start": round(elapsed, 3),
                "end": round(elapsed + dur, 3),
                "text": chunk_text,
            })
            elapsed += dur

        # Concatenate chunks
        if len(chunk_paths) == 1:
            chunk_paths[0].rename(output_path)
        else:
            self._concatenate_audio(chunk_paths, output_path)
            for cp in chunk_paths:
                cp.unlink(missing_ok=True)

        return output_path, timing_data

    def _split_text(self, text: str, max_chars: int = 220) -> list[str]:
        """Split text into chunks small enough for XTTS's 400-token limit.

        Strategy (in order):
        1. Split at sentence boundaries (. ! ? … and em-dash dialogue lines)
        2. If a sentence still exceeds max_chars, split further at commas
        3. If a comma-piece still exceeds max_chars, hard-split at word boundary
        """
        import re

        # Normalise newlines, collapse whitespace
        text = re.sub(r"\s+", " ", text).strip()

        # Step 1: split at sentence boundaries, keeping the delimiter
        raw_sentences = re.split(r"(?<=[.!?…])\s+|(?<=–)\s+|(?<=—)\s+", text)

        pieces: list[str] = []
        for sent in raw_sentences:
            sent = sent.strip()
            if not sent:
                continue
            if len(sent) <= max_chars:
                pieces.append(sent)
            else:
                # Step 2: split long sentences at commas
                parts = re.split(r",\s*", sent)
                buf = ""
                for part in parts:
                    candidate = f"{buf}, {part}".strip(", ") if buf else part
                    if len(candidate) <= max_chars:
                        buf = candidate
                    else:
                        if buf:
                            pieces.append(buf.strip())
                        # Step 3: hard word-boundary split for very long parts
                        if len(part) > max_chars:
                            words = part.split()
                            buf = ""
                            for word in words:
                                trial = f"{buf} {word}".strip() if buf else word
                                if len(trial) <= max_chars:
                                    buf = trial
                                else:
                                    if buf:
                                        pieces.append(buf)
                                    buf = word
                            buf = buf  # carry forward
                        else:
                            buf = part
                if buf.strip():
                    pieces.append(buf.strip())

        return [p for p in pieces if p] or [text]

    def _concatenate_audio(self, paths: list[Path], output: Path, seg_types: list[str] | None = None):
        """Concatenate WAV files using pydub with calibrated pauses between segments."""
        from pydub import AudioSegment as PydubAudio

        result = PydubAudio.empty()
        for i, path in enumerate(paths):
            segment = PydubAudio.from_wav(str(path))
            result += segment
            if i < len(paths) - 1:
                if seg_types and i + 1 < len(seg_types):
                    pause_ms = build_pause_between(seg_types[i], seg_types[i + 1])
                else:
                    pause_ms = DEFAULT_PAUSE_MS
                result += PydubAudio.silent(duration=pause_ms)

        result.export(str(output), format="wav")
