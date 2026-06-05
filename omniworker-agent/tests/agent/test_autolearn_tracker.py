"""Shared persistent autolearning tracker (D5)."""

from agent.autolearn_tracker import AutolearnTracker, bucket_of


def _t(tmp_path):
    return AutolearnTracker(path=tmp_path / "patterns.json")


def test_bucket_normalizes_text():
    assert bucket_of("Traducí este Contrato legal urgente!!") == "traducí este contrato legal"
    assert bucket_of("") == "general"


def test_proposes_once_at_threshold(tmp_path):
    t = _t(tmp_path)
    msg = "traducir contrato legal"
    assert t.record_and_check(msg, threshold=3) is False  # count 1
    assert t.record_and_check(msg, threshold=3) is False  # count 2
    assert t.record_and_check(msg, threshold=3) is True   # count 3 → propose
    assert t.record_and_check(msg, threshold=3) is False  # already proposed


def test_distinct_patterns_counted_separately(tmp_path):
    t = _t(tmp_path)
    for _ in range(3):
        t.record("traducir contrato legal")
    for _ in range(2):
        t.record("resumir reunión semanal")
    assert t.should_propose("traducir contrato legal", threshold=3) is True
    assert t.should_propose("resumir reunión semanal", threshold=3) is False


def test_persists_across_instances(tmp_path):
    t1 = _t(tmp_path)
    t1.record("traducir contrato")
    t1.record("traducir contrato")
    # New instance (simulates restart) keeps the count → one more proposes.
    t2 = _t(tmp_path)
    assert t2.count("traducir contrato") == 2
    assert t2.record_and_check("traducir contrato", threshold=3) is True


def test_shared_between_chat_and_daemon(tmp_path):
    # Two trackers on the same file = chat + daemon sharing one loop.
    chat = _t(tmp_path)
    daemon = _t(tmp_path)
    chat.record("armar reporte mensual")
    chat.record("armar reporte mensual")
    # The daemon, reading the same file fresh, sees the chat's contributions.
    daemon2 = _t(tmp_path)
    assert daemon2.record_and_check("armar reporte mensual", threshold=3) is True
