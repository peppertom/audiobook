import json
import logging
from dataclasses import dataclass, field
import httpx

logger = logging.getLogger(__name__)

SUMMARY_PROMPT = """\
You are a book summarizer. Read the following chapter excerpt and write a concise \
summary in {language}. The summary should be 3-5 sentences (~100-150 words) that \
captures the key events and themes. Do not include spoiler warnings or meta-commentary. \
Write as if describing the chapter to someone browsing the table of contents.

Return a JSON object with a single "summary" field containing the summary text.

Chapter text (first 3000 characters):
{chapter_text}
"""

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
                    "think": False,
                },
            )
            response.raise_for_status()
            data = response.json()
            # qwen3 models with thinking mode put output in "thinking" field when
            # format:json is used; fall back to it if "response" is empty
            raw = data.get("response") or data.get("thinking", "")
            return json.loads(raw)

    async def generate_summary(self, chapter_text: str, language: str = "Hungarian") -> str:
        """Generate a short chapter summary. Returns empty string on error."""
        prompt = SUMMARY_PROMPT.format(
            chapter_text=chapter_text[:3000],
            language=language,
        )
        try:
            result = await self._call_ollama(prompt)
            return result.get("summary", "")
        except Exception as e:
            logger.warning(f"Summary generation failed, skipping: {e}")
            return ""

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
