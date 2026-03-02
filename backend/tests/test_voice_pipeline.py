import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from app.services.voice_pipeline import download_youtube_audio, extract_vocals


def test_download_youtube_audio_calls_ytdlp(tmp_path):
    """Test that yt-dlp is called with correct options."""
    with patch("app.services.voice_pipeline.yt_dlp.YoutubeDL") as mock_ydl:
        instance = MagicMock()
        mock_ydl.return_value.__enter__ = MagicMock(return_value=instance)
        mock_ydl.return_value.__exit__ = MagicMock(return_value=False)
        instance.extract_info.return_value = {"title": "Test Video"}

        # Create a fake output file so the function finds it
        fake_output = tmp_path / "audio.wav"
        fake_output.write_bytes(b"fake audio")

        result = download_youtube_audio("https://youtube.com/watch?v=test", tmp_path)
        instance.extract_info.assert_called_once()
