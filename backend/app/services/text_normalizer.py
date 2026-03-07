import re


def preprocess_for_tts(text: str) -> str:
    """Normalize text for TTS synthesis."""
    if not text:
        return ""
    text = re.sub(r"\s*\u2014\s*", ", ", text)  # em dash with surrounding spaces
    text = re.sub(r" \u2013 ", ", ", text)  # en dash
    text = re.sub(r"\[(\d+)\]", "", text)
    text = re.sub(r"\bDr\.", "Doktor", text)
    text = re.sub(r"\bProf\.", "Professzor", text)
    text = text.strip()
    text = text.replace("...", "\u2026 ")  # after strip so trailing space is preserved
    return text


_DIALOGUE_RE = re.compile(r'[\u201e\u201c"][^\u201e\u201c"]{5,}[\u201d"]')
_ACTION_VERBS_HU = re.compile(
    r"\b(futott|felkapta|megfordult|becsapta|fel\u00e1llt|r\u00e1rontott|elesett|"
    r"ki\u00e1ltott|ugrott|rohant|r\u00e1ntotta|l\u00f6kte|ragadta|dobta|csapta)\b",
    re.IGNORECASE,
)


def classify_segment(text: str, has_italic: bool = False) -> str:
    """Classify a text segment into a narration type."""
    if _DIALOGUE_RE.search(text):
        return "dialogue"
    if has_italic:
        return "inner_monologue"
    if len(text.split()) < 12 and _ACTION_VERBS_HU.search(text):
        return "action"
    return "narration"
