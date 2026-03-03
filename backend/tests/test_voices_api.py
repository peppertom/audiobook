import pytest
from unittest.mock import patch


@pytest.mark.asyncio
async def test_create_voice(client):
    response = await client.post("/api/voices/", json={
        "name": "Test Voice", "description": "A test", "language": "hu", "source": "upload"
    })
    assert response.status_code == 201
    assert response.json()["name"] == "Test Voice"


@pytest.mark.asyncio
async def test_list_voices(client):
    await client.post("/api/voices/", json={"name": "V1", "language": "hu", "source": "upload"})
    response = await client.get("/api/voices/")
    assert response.status_code == 200
    assert len(response.json()) >= 1


@pytest.mark.asyncio
async def test_upload_reference_clip_wav(client):
    create = await client.post("/api/voices/", json={"name": "Wav Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    fake_wav = b"RIFF" + b"\x00" * 100
    with patch("app.routers.voices.convert_to_wav") as mock_convert:
        mock_convert.return_value = None  # skip actual ffmpeg
        # Manually create the expected output file so the endpoint finds it
        from app.config import settings
        clip_path = settings.voices_path / f"voice_{voice_id}_ref.wav"
        clip_path.parent.mkdir(parents=True, exist_ok=True)
        clip_path.write_bytes(fake_wav)

        response = await client.post(
            f"/api/voices/{voice_id}/reference-clip",
            files={"file": ("clip.wav", fake_wav, "audio/wav")},
        )
    assert response.status_code == 200
    assert response.json()["reference_clip_path"] is not None


@pytest.mark.asyncio
async def test_upload_reference_clip_mp3(client):
    create = await client.post("/api/voices/", json={"name": "Mp3 Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    fake_mp3 = b"\xff\xfb\x90" + b"\x00" * 100
    with patch("app.routers.voices.convert_to_wav") as mock_convert:
        mock_convert.return_value = None
        from app.config import settings
        clip_path = settings.voices_path / f"voice_{voice_id}_ref.wav"
        clip_path.parent.mkdir(parents=True, exist_ok=True)
        clip_path.write_bytes(fake_mp3)

        response = await client.post(
            f"/api/voices/{voice_id}/reference-clip",
            files={"file": ("voice.mp3", fake_mp3, "audio/mpeg")},
        )
    assert response.status_code == 200
    assert response.json()["reference_clip_path"] is not None


@pytest.mark.asyncio
async def test_upload_reference_clip_rejects_invalid_format(client):
    create = await client.post("/api/voices/", json={"name": "Bad Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    response = await client.post(
        f"/api/voices/{voice_id}/reference-clip",
        files={"file": ("doc.pdf", b"fake", "application/pdf")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_delete_voice(client):
    create = await client.post("/api/voices/", json={"name": "Del Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    response = await client.delete(f"/api/voices/{voice_id}")
    assert response.status_code == 204
