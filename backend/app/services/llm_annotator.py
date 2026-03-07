import json
import logging
from dataclasses import dataclass, field
import httpx

logger = logging.getLogger(__name__)

CHAPTER_ARC_PROMPT = """\
Hangoskönyv-rendező vagy. Elemezd a regényfejezet alábbi részletét, \
és adj vissza JSON objektumot az alábbi mezőkkel:
- dominant_emotion: az egyik: neutral, happy, sad, tense, angry, whisper
- pacing: az egyik: slow, medium, fast
- intensity: egész szám 1-10 között
- narrator_note: egy mondat magyarul a narrátornak útmutatásként

Csak valid JSON-t adj vissza, más szöveget nem!

Fejezet szövege (első 2000 karakter):
{chapter_text}
"""


@dataclass
class EmotionalArc:
    dominant_emotion: str = "neutral"
    pacing: str = "medium"
    intensity: int = 5
    narrator_note: str = ""


class LLMAnnotator:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url
        self.model = model

    async def _call_ollama(self, prompt: str) -> dict:
        """Call Ollama API and parse JSON response."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            response.raise_for_status()
            data = response.json()
            return json.loads(data["response"])

    async def analyze_chapter_arc(self, chapter_text: str) -> EmotionalArc:
        """Analyze the emotional arc of a chapter. Returns fallback on error."""
        prompt = CHAPTER_ARC_PROMPT.format(chapter_text=chapter_text[:2000])
        try:
            result = await self._call_ollama(prompt)
            return EmotionalArc(
                dominant_emotion=result.get("dominant_emotion", "neutral"),
                pacing=result.get("pacing", "medium"),
                intensity=int(result.get("intensity", 5)),
                narrator_note=result.get("narrator_note", ""),
            )
        except Exception as e:
            logger.warning(f"LLM annotation failed, using fallback: {e}")
            return EmotionalArc()
