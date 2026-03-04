"""XTTS-v2 Text-to-Speech engine."""
import os
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

        on_progress: optional callback(chunk_index, total_chunks, chunk_text_preview)

        Returns:
            (output_path, timing_data) where timing_data is a list of
            {"start": float, "end": float, "text": str} per chunk.
        """
        if not self.model:
            raise RuntimeError("TTS model not loaded. Call load_model() first.")

        # XTTS-v2 has a context window limit, split long text into chunks
        chunks = self._split_text(text, max_chars=500)
        chunk_paths = []
        chunk_durations = []

        for i, chunk in enumerate(chunks):
            if on_progress:
                on_progress(i, len(chunks), chunk[:80])
            chunk_path = output_path.parent / f"{output_path.stem}_chunk_{i}.wav"
            self.model.tts_to_file(
                text=chunk,
                speaker_wav=str(reference_clip),
                language=language,
                file_path=str(chunk_path),
            )
            chunk_paths.append(chunk_path)
            chunk_durations.append(self._get_wav_duration(chunk_path))

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

    def _split_text(self, text: str, max_chars: int = 500) -> list[str]:
        """Split text into chunks at sentence boundaries."""
        sentences = []
        current = ""
        for sentence in text.replace("\n", " ").split(". "):
            candidate = f"{current}. {sentence}".strip() if current else sentence
            if len(candidate) > max_chars and current:
                sentences.append(current.strip())
                current = sentence
            else:
                current = candidate
        if current.strip():
            sentences.append(current.strip())
        return sentences if sentences else [text]

    def _concatenate_audio(self, paths: list[Path], output: Path):
        """Concatenate WAV files using ffmpeg."""
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            for p in paths:
                f.write(f"file '{p}'\n")
            list_path = f.name
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", str(output)],
            check=True, capture_output=True,
        )
        Path(list_path).unlink(missing_ok=True)
