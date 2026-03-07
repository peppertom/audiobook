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
