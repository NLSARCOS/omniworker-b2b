"""External signal intake (C6) — initiative from outside without a human."""

import json

from agent import signal_intake as si


def test_actionable_request_detected():
    assert si.is_actionable({"sender": "cliente@x.com", "subject": "Necesito un presupuesto", "body": ""})
    assert si.is_actionable({"subject": "", "body": "¿Podrían enviarme una propuesta?"})


def test_noise_not_actionable():
    assert not si.is_actionable({"sender": "no-reply@x.com", "subject": "Newsletter", "body": "..."})
    assert not si.is_actionable({"subject": "Out of office", "body": "estoy fuera de la oficina"})
    assert not si.is_actionable({"subject": "hola", "body": "gracias"})


def test_signal_to_task_uses_subject_and_context():
    spec = si.signal_to_task({
        "source": "email", "sender": "ana@cliente.com",
        "subject": "Necesito cotización para 50 licencias", "body": "Para el lunes.",
    })
    assert "cotización" in spec["title"].lower()
    assert "ana@cliente.com" in spec["body"]
    assert "email" in spec["body"].lower()


def test_ingest_creates_task_when_actionable(tmp_path):
    from omniworker_cli import kanban_db

    conn = kanban_db.connect(db_path=tmp_path / "b.db")
    tid = si.ingest_signal(conn, {
        "id": "sig1", "source": "email", "sender": "x@y.com",
        "subject": "Necesito un presupuesto", "body": "urgente",
    })
    assert tid
    titles = {getattr(t, "title", None) for t in kanban_db.list_tasks(conn)}
    assert any("presupuesto" in (t or "").lower() for t in titles)


def test_ingest_skips_non_actionable(tmp_path):
    from omniworker_cli import kanban_db

    conn = kanban_db.connect(db_path=tmp_path / "b.db")
    tid = si.ingest_signal(conn, {"id": "sig2", "subject": "newsletter", "body": "unsubscribe"})
    assert tid is None


def test_ingest_idempotent_on_signal_id(tmp_path):
    from omniworker_cli import kanban_db

    conn = kanban_db.connect(db_path=tmp_path / "b.db")
    sig = {"id": "dup", "subject": "Necesito ayuda con la factura", "body": ""}
    t1 = si.ingest_signal(conn, sig)
    t2 = si.ingest_signal(conn, sig)
    assert t1 == t2  # same idempotency key → same task, no duplicate


def test_poll_inbox_processes_and_moves_files(tmp_path):
    from omniworker_cli import kanban_db

    conn = kanban_db.connect(db_path=tmp_path / "b.db")
    inbox = tmp_path / "signals" / "inbox"
    inbox.mkdir(parents=True)
    (inbox / "a.json").write_text(json.dumps(
        {"id": "a", "source": "email", "subject": "Necesito una propuesta", "body": ""}
    ))
    (inbox / "b.json").write_text(json.dumps(
        {"id": "b", "subject": "newsletter", "body": "unsubscribe"}
    ))

    created = si.poll_signal_inbox(conn, inbox_dir=inbox)
    assert len(created) == 1                       # only the actionable one
    assert not list(inbox.glob("*.json"))          # both files moved out
    assert (tmp_path / "signals" / "processed").exists()
    assert (tmp_path / "signals" / "ignored").exists()
