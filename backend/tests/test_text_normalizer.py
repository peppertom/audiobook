import pytest
from app.services.text_normalizer import preprocess_for_tts, classify_segment


def test_em_dash_replaced():
    assert preprocess_for_tts("Várj — mondta") == "Várj, mondta"


def test_en_dash_replaced():
    assert preprocess_for_tts("ez – az") == "ez, az"


def test_ellipsis_normalized():
    result = preprocess_for_tts("Igen...")
    assert result == "Igen… "


def test_footnote_ref_removed():
    assert preprocess_for_tts("szöveg[12] folytatás") == "szöveg folytatás"


def test_dr_expanded():
    assert preprocess_for_tts("Dr. Kiss Péter") == "Doktor Kiss Péter"


def test_prof_expanded():
    assert preprocess_for_tts("Prof. Nagy") == "Professzor Nagy"


def test_empty_string():
    assert preprocess_for_tts("") == ""


def test_classify_dialogue_hungarian_quotes():
    assert classify_segment('„Gyere ide!" — mondta.') == "dialogue"


def test_classify_dialogue_english_quotes():
    assert classify_segment('"Come here!" he said.') == "dialogue"


def test_classify_inner_monologue():
    assert classify_segment("Sosem fogja megérteni", has_italic=True) == "inner_monologue"


def test_classify_action_beat():
    result = classify_segment("Felkapta a kabátját és futott.")
    assert result == "action"


def test_classify_narration_default():
    result = classify_segment("A szoba sarkában egy régi szekrény állt.")
    assert result == "narration"
