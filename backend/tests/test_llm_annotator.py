import pytest
from unittest.mock import patch, AsyncMock
from app.services.llm_annotator import LLMAnnotator, EmotionalArc


def test_emotional_arc_defaults():
    arc = EmotionalArc(dominant_emotion="neutral", pacing="medium", intensity=5)
    assert arc.narrator_note == ""


@pytest.mark.asyncio
async def test_analyze_chapter_arc_returns_arc():
    annotator = LLMAnnotator(base_url="http://localhost:11434", model="test-model")
    mock_response = {
        "dominant_emotion": "tense",
        "pacing": "fast",
        "intensity": 8,
        "narrator_note": "Feszült jelenet, lassíts a csúcspont előtt.",
    }
    with patch.object(annotator, "_call_ollama", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_response
        arc = await annotator.analyze_chapter_arc("Szöveg itt...")
    assert arc.dominant_emotion == "tense"
    assert arc.intensity == 8


@pytest.mark.asyncio
async def test_analyze_chapter_arc_fallback_on_error():
    annotator = LLMAnnotator(base_url="http://localhost:11434", model="test-model")
    with patch.object(annotator, "_call_ollama", new_callable=AsyncMock) as mock_call:
        mock_call.side_effect = Exception("Ollama not running")
        arc = await annotator.analyze_chapter_arc("Szöveg itt...")
    assert arc.dominant_emotion == "neutral"  # fallback


@pytest.mark.asyncio
async def test_generate_summary_returns_text():
    annotator = LLMAnnotator(base_url="http://localhost:11434", model="test-model")
    mock_response = {"summary": "Ez a fejezet arról szól, hogy a főhős elindul egy kalandba."}
    with patch.object(annotator, "_call_ollama", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_response
        summary = await annotator.generate_summary("Hosszú fejezet szöveg itt...", language="hu")
    assert summary == "Ez a fejezet arról szól, hogy a főhős elindul egy kalandba."
    mock_call.assert_called_once()


@pytest.mark.asyncio
async def test_generate_summary_fallback_on_error():
    annotator = LLMAnnotator(base_url="http://localhost:11434", model="test-model")
    with patch.object(annotator, "_call_ollama", new_callable=AsyncMock) as mock_call:
        mock_call.side_effect = Exception("Ollama not running")
        summary = await annotator.generate_summary("Szöveg itt...", language="hu")
    assert summary == ""


@pytest.mark.asyncio
async def test_generate_summary_truncates_input():
    annotator = LLMAnnotator(base_url="http://localhost:11434", model="test-model")
    long_text = "A" * 5000
    mock_response = {"summary": "Rövid összefoglaló."}
    with patch.object(annotator, "_call_ollama", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = mock_response
        await annotator.generate_summary(long_text, language="hu")
    call_prompt = mock_call.call_args[0][0]
    assert "A" * 3000 in call_prompt
    assert "A" * 3001 not in call_prompt
