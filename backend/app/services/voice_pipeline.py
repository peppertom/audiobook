import subprocess
from pathlib import Path
import yt_dlp


def download_youtube_audio(url: str, output_dir: Path) -> Path:
    """Download audio from a YouTube URL, output as WAV."""
    output_path = output_dir / "audio"
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(output_path),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.extract_info(url, download=True)

    wav_path = output_path.with_suffix(".wav")
    if not wav_path.exists():
        raise FileNotFoundError(f"Download failed: {wav_path}")
    return wav_path


def extract_vocals(audio_path: Path, output_dir: Path) -> Path:
    """Use demucs to isolate vocals from audio."""
    subprocess.run(
        ["python", "-m", "demucs", "--two-stems", "vocals", "-o", str(output_dir), str(audio_path)],
        check=True,
        capture_output=True,
    )
    # Demucs outputs to: output_dir/htdemucs/audio/vocals.wav
    vocals_path = output_dir / "htdemucs" / audio_path.stem / "vocals.wav"
    if not vocals_path.exists():
        raise FileNotFoundError(f"Vocal extraction failed: {vocals_path}")
    return vocals_path


def trim_audio(input_path: Path, output_path: Path, start_sec: float, end_sec: float) -> Path:
    """Trim audio to a specific time range using ffmpeg."""
    duration = end_sec - start_sec
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(input_path),
            "-ss", str(start_sec), "-t", str(duration),
            "-ar", "22050", "-ac", "1",  # XTTS-v2 expects 22050Hz mono
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )
    return output_path
