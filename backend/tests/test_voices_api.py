import pytest


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
async def test_upload_reference_clip(client, tmp_path):
    # Create a voice first
    create = await client.post("/api/voices/", json={"name": "Clip Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    # Upload a fake WAV file as reference clip
    fake_wav = b"RIFF" + b"\x00" * 100  # minimal fake header
    response = await client.post(
        f"/api/voices/{voice_id}/reference-clip",
        files={"file": ("clip.wav", fake_wav, "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["reference_clip_path"] is not None


@pytest.mark.asyncio
async def test_delete_voice(client):
    create = await client.post("/api/voices/", json={"name": "Del Voice", "language": "hu", "source": "upload"})
    voice_id = create.json()["id"]
    response = await client.delete(f"/api/voices/{voice_id}")
    assert response.status_code == 204
