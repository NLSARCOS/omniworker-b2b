"""Orchestrator daemon — the autonomous heart of the OmniWorker orchestrator.

A background loop that gives the orchestrator initiative. It does not wait for
the human: it polls the kanban, classifies ready/unassigned tasks, delegates
each to the right registry agent, reactivates stalled work, and runs scheduled
(cron) tasks. After every completed task it checks the autolearning triggers
(propose a skill / propose a new specialist agent).

Design seams (so the loop is testable without a live model)
-----------------------------------------------------------
* ``delegate_fn(agent_type, goal, context, complexity) -> summary`` — injected.
  Production wires it to :func:`build_delegate_fn` (which drives the real
  ``delegate_task`` through a long-lived orchestrator agent). Tests pass a fake.
* ``classify_fn(task) -> (agent_type, complexity)`` — defaults to a keyword
  heuristic; override to plug in ``intent_classifier`` or an LLM call.
* ``notify_fn(message)`` — operator notifications (model changes, agent
  proposals). Defaults to logging.

Loop-detection: a task that fails ``MAX_FAILURES`` times is escalated (blocked +
operator notified) instead of being retried forever. The kanban ``Task`` model
already tracks ``consecutive_failures``, so we honour it.
"""

from __future__ import annotations

import concurrent.futures
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Keyword → agent_type heuristic for classify_task. First match wins; order
# matters (more specific buckets first). Unmatched tasks fall to general_agent.
_CLASSIFY_RULES: List[Tuple[str, List[str]]] = [
    ("developer",   ["bug", "fix", "implement", "feature", "refactor", "código", "code", "endpoint", "api "]),
    ("reviewer",    ["review", "audit", "qa", "revis", "auditor", "test coverage"]),
    ("researcher",  ["research", "investiga", "buscar", "find out", "competit", "market"]),
    ("data_analyst",["analy", "anali", "data", "dataset", "report", "métrica", "metric", "chart"]),
    ("browser_agent",["scrap", "browser", "navega", "screenshot", "fill form", "web ui"]),
    ("marketer",    ["copy", "marketing", "ad ", "ads", "campaign", "landing", "estrategia comercial"]),
    ("planner",     ["plan", "arquitect", "design ", "diseñ", "descompon", "spec", "roadmap"]),
    ("code_runner", ["run script", "execute", "ejecuta", "cron", "automatiz", "deploy"]),
]

# Complexity heuristic by task body length / keywords (for general_agent tier).
_COMPLEX_KEYWORDS = ("investiga", "research", "redact", "write a", "estrategia", "diseñ", "plan complejo")
_SIMPLE_KEYWORDS = ("email", "resume", "resumen", "responde", "reply", "traduc", "translate")


def classify_task(task: Any) -> Tuple[str, Optional[str]]:
    """Map a kanban task to ``(agent_type, complexity)``.

    ``complexity`` is only meaningful when ``agent_type == 'general_agent'``.
    Accepts any object exposing ``title``/``body`` (the kanban ``Task``).
    """
    title = (getattr(task, "title", "") or "").lower()
    body = (getattr(task, "body", "") or "").lower()
    text = f"{title} {body}"

    for agent_type, keywords in _CLASSIFY_RULES:
        if any(k in text for k in keywords):
            return agent_type, None

    # No specialist matched → general_agent, pick a complexity tier.
    if any(k in text for k in _COMPLEX_KEYWORDS) or len(body) > 600:
        return "general_agent", "complex"
    if any(k in text for k in _SIMPLE_KEYWORDS) and len(body) < 200:
        return "general_agent", "simple"
    return "general_agent", "medium"


@dataclass
class DaemonConfig:
    poll_interval: float = 30.0       # seconds between ticks
    max_failures: int = 3             # loop detection: escalate after N failures
    stalled_hours: float = 24.0       # reactivate tasks idle longer than this
    nudge_after_uses: int = 5         # general_agent recurrence → propose agent
    max_tasks_per_tick: int = 5       # backpressure: cap delegations per tick
    skill_propose_after: int = 3      # same task pattern N times → propose a skill


@dataclass
class OrchestratorDaemon:
    """Autonomous kanban-polling delegation loop."""

    kanban_conn: Any
    delegate_fn: Callable[..., str]
    classify_fn: Callable[[Any], Tuple[str, Optional[str]]] = classify_task
    notify_fn: Optional[Callable[[str], None]] = None
    config: DaemonConfig = field(default_factory=DaemonConfig)
    usage_tracker: Any = None          # agent_proposals.UsageTracker (optional)
    # Model-catalog auto-update hook. When set, cron tasks tagged
    # ``kind == "catalog"`` invoke this instead of delegating (see model_catalog).
    catalog_check_fn: Optional[Callable[[], Any]] = None
    # Spend rail + kill-switch. When set, every delegation is gated by
    # ``budget.allow()`` and usage is recorded after each run (see
    # agent.orchestrator_budget). None = no budget enforcement.
    budget: Any = None
    _budget_notified: bool = field(default=False, init=False)
    # Planner callable for objective decomposition: ``(prompt) -> str``. When
    # None, defaults to delegating to the ``planner`` agent (see _handle_objective).
    planner_fn: Optional[Callable[[str], str]] = None
    # Poll <HOME>/signals/inbox each tick → turn external signals into tasks.
    signals_enabled: bool = True
    _skill_counts: Dict[str, int] = field(default_factory=dict, init=False)
    _autolearn: Any = field(default=None, init=False)

    _stop: threading.Event = field(default_factory=threading.Event, init=False)
    _thread: Optional[threading.Thread] = field(default=None, init=False)
    _tick_executor: Optional[concurrent.futures.ThreadPoolExecutor] = field(default=None, init=False)
    # Cron tasks: list of {"schedule": cron-expr, "task": label, "agent_type": str}
    cron_tasks: List[Dict[str, Any]] = field(default_factory=list)
    _last_cron_run: Dict[str, float] = field(default_factory=dict, init=False)

    # ── lifecycle ───────────────────────────────────────────────────────────

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        # One persistent executor for the watchdog. Using shutdown(wait=False)
        # on stop() ensures a hung tick thread is abandoned — not waited on.
        self._tick_executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="orch-tick"
        )
        self._thread = threading.Thread(
            target=self._run_forever, name="orchestrator-daemon", daemon=True
        )
        self._thread.start()
        logger.info("OrchestratorDaemon started (poll=%ss)", self.config.poll_interval)

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        # Abandon any in-flight tick without waiting (it may be hung).
        if self._tick_executor is not None:
            self._tick_executor.shutdown(wait=False)
        if self._thread:
            self._thread.join(timeout=timeout)
        logger.info("OrchestratorDaemon stopped")

    def _run_forever(self) -> None:
        """Main daemon loop with per-tick watchdog.

        Each tick is submitted to ``_tick_executor`` (a thread pool with one
        worker). ``future.result(timeout=…)`` raises ``TimeoutError`` if the
        tick hangs — the loop logs it, skips to the next cycle, and submits a
        *new* future (which runs in the same executor thread once the old one
        eventually unblocks or is killed at process exit).

        Key design constraint: we do NOT call ``executor.shutdown(wait=True)``
        inside the loop — that would block until the stuck thread finishes,
        defeating the purpose of the timeout. The executor is shut down only in
        ``stop()`` with ``wait=False``.
        """
        tick_timeout = self.config.poll_interval * 3
        while not self._stop.is_set():
            try:
                future = self._tick_executor.submit(self.tick)
                try:
                    future.result(timeout=tick_timeout)
                except concurrent.futures.TimeoutError:
                    # Cancel the future so it won't run if still queued.
                    # If already running, it finishes in the background — the
                    # next submit() will queue behind it, so we skip one poll
                    # interval as back-pressure. This is acceptable.
                    future.cancel()
                    logger.error(
                        "Orchestrator tick hung for >%.0fs — skipping this cycle. "
                        "Check if the delegated model is responding.",
                        tick_timeout,
                    )
            except RuntimeError:
                # Executor was shut down (gateway stopping) — exit cleanly.
                break
            except Exception as exc:  # noqa: BLE001 — never let the loop die
                logger.exception("daemon tick error: %s", exc)
            self._stop.wait(self.config.poll_interval)

    # ── one cycle ───────────────────────────────────────────────────────────

    def tick(self) -> Dict[str, Any]:
        """Run one cycle. Returns a summary dict (handy for tests/telemetry)."""
        dispatched: List[str] = []
        reactivated: List[str] = []
        escalated: List[str] = []

        # 0. Kill-switch — instant halt, no dispatch this tick.
        if self.budget is not None and self.budget.killed():
            self._notify_budget_once("🛑 Orquestador detenido por kill-switch (orchestrator.STOP).")
            return {"dispatched": [], "reactivated": [], "escalated": [], "halted": "killswitch"}

        # 1. External signals → tasks (initiative without a human carding them).
        if self.signals_enabled:
            try:
                from agent.signal_intake import poll_signal_inbox

                for tid in poll_signal_inbox(self.kanban_conn):
                    dispatched.append(f"signal:{tid}")
            except Exception as exc:  # noqa: BLE001
                logger.debug("signal intake failed: %s", exc)

        # 2. Due cron tasks
        for cron in self._due_cron_tasks():
            self._dispatch_cron(cron)
            dispatched.append(f"cron:{cron.get('task')}")

        # 2. Ready + unassigned kanban tasks
        ready = self._get_ready_unassigned()
        for task in ready[: self.config.max_tasks_per_tick]:
            # Budget rail — pause delegation when a cap is hit.
            if self.budget is not None:
                ok, reason = self.budget.allow()
                if not ok:
                    self._notify_budget_once(f"⏸️ Orquestador en pausa: {reason}")
                    break
            # Objective → decompose into subtasks (initiative), don't delegate.
            if self._is_objective(task):
                self._handle_objective(task)
                dispatched.append(f"objective:{getattr(task, 'id', '?')}")
                continue
            if self._failures(task) >= self.config.max_failures:
                self._escalate(task)
                escalated.append(getattr(task, "id", "?"))
                continue
            self._delegate_task(task)
            dispatched.append(getattr(task, "id", "?"))

        # 3. Stalled tasks (running too long without progress)
        for task in self._get_stalled():
            self._reactivate_or_escalate(task)
            reactivated.append(getattr(task, "id", "?"))

        return {
            "dispatched": dispatched,
            "reactivated": reactivated,
            "escalated": escalated,
        }

    # ── kanban access (thin wrappers, swappable in tests) ───────────────────

    def _get_ready_unassigned(self) -> List[Any]:
        from omniworker_cli import kanban_db

        tasks = kanban_db.list_tasks(self.kanban_conn, status="ready")
        return [t for t in tasks if not getattr(t, "assignee", None)]

    def _get_stalled(self) -> List[Any]:
        from omniworker_cli import kanban_db

        cutoff = time.time() - self.config.stalled_hours * 3600
        running = kanban_db.list_tasks(self.kanban_conn, status="running")
        out = []
        for t in running:
            hb = getattr(t, "last_heartbeat_at", None) or getattr(t, "started_at", None)
            if hb and hb < cutoff:
                out.append(t)
        return out

    def _failures(self, task: Any) -> int:
        return int(getattr(task, "consecutive_failures", 0) or 0)

    # ── delegation ──────────────────────────────────────────────────────────

    def _delegate_task(self, task: Any) -> None:
        from agent.delegation_brief import build_brief, extract_summary

        agent_type, complexity = self.classify_fn(task)
        title = getattr(task, "title", "") or ""
        body = getattr(task, "body", "") or None
        task_id = getattr(task, "id", None)
        # Worker gets a tight brief — objective + minimal context — not history.
        brief = build_brief(goal=title, context=body)

        logger.info(
            "Delegating task %s → %s%s",
            task_id, agent_type, f" (complexity={complexity})" if complexity else "",
        )
        started = time.time()
        try:
            raw = self.delegate_fn(
                agent_type=agent_type,
                goal=title,
                context=brief,
                complexity=complexity,
            )
            summary = extract_summary(raw)
            self._record_result(task, summary, success=True)
            model, in_tok, out_tok = _extract_usage(raw)
            if self.budget is not None:
                self.budget.record(model=model, input_tokens=in_tok, output_tokens=out_tok)
                self._budget_notified = False  # spend resumed — re-arm notifications
            self._record_telemetry(
                task_id, agent_type, model, in_tok, out_tok, "completed", time.time() - started
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Delegation failed for %s: %s", task_id, exc)
            self._record_telemetry(task_id, agent_type, None, 0, 0, "failed", time.time() - started)
            self._record_result(task, str(exc), success=False)
            return

        # Autolearning: skill proposal on recurring patterns (every agent), and
        # specialist-agent proposal on general_agent recurrence.
        self._check_skill_proposal(task)
        if agent_type == "general_agent":
            self._check_agent_proposal(task)

    # ── objective decomposition (initiative — Objetivo 1) ───────────────────

    def _is_objective(self, task: Any) -> bool:
        from agent.objective_decomposer import is_objective

        return is_objective(
            title=getattr(task, "title", "") or "",
            body=getattr(task, "body", "") or "",
            kind=getattr(task, "kind", "") or "",
        )

    def _handle_objective(self, task: Any) -> None:
        """Decompose an objective task into kanban subtasks (no human needed)."""
        from agent.objective_decomposer import seed_objective

        planner = self.planner_fn or (
            lambda prompt: self.delegate_fn(agent_type="planner", goal=prompt)
        )
        goal = f"{getattr(task, 'title', '') or ''}\n{getattr(task, 'body', '') or ''}".strip()
        task_id = getattr(task, "id", None)
        try:
            created = seed_objective(
                self.kanban_conn, objective_id=task_id, goal=goal, planner_fn=planner
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("objective decomposition failed for %s: %s", task_id, exc)
            return
        if created and task_id is not None:
            self._record_result(
                task, f"Descompuesto en {len(created)} subtareas: {', '.join(created)}", success=True
            )

    def _dispatch_cron(self, cron: Dict[str, Any]) -> None:
        # Model-catalog check: not a delegation — run the auto-update poller.
        if cron.get("kind") == "catalog":
            if self.catalog_check_fn:
                try:
                    self.catalog_check_fn()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("catalog check failed: %s", exc)
            self._last_cron_run[self._cron_key(cron)] = time.time()
            return

        agent_type = cron.get("agent_type") or "general_agent"
        goal = cron.get("task") or "scheduled task"
        try:
            self.delegate_fn(
                agent_type=agent_type, goal=goal, context=cron.get("context"),
                complexity=cron.get("complexity"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cron task '%s' failed: %s", goal, exc)
        self._last_cron_run[self._cron_key(cron)] = time.time()

    def _record_result(self, task: Any, summary: str, *, success: bool) -> None:
        task_id = getattr(task, "id", None)
        if task_id is None:
            return
        try:
            from omniworker_cli import kanban_db

            if success:
                kanban_db.complete_task(
                    self.kanban_conn, task_id, summary=_truncate(summary, 2000)
                )
            else:
                # Record the failure; kanban increments consecutive_failures and
                # the next tick's loop-detection handles escalation.
                _record_failure(kanban_db, self.kanban_conn, task_id, summary)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Could not record kanban result for %s: %s", task_id, exc)

    # ── stalled / escalation ────────────────────────────────────────────────

    def _reactivate_or_escalate(self, task: Any) -> None:
        if self._failures(task) >= self.config.max_failures:
            self._escalate(task)
        else:
            self._delegate_task(task)

    def _escalate(self, task: Any) -> None:
        task_id = getattr(task, "id", "?")
        title = getattr(task, "title", "") or ""
        msg = (
            f"⚠️ Tarea '{title}' ({task_id}) escalada: superó "
            f"{self.config.max_failures} fallos consecutivos. Requiere atención "
            f"del operador."
        )
        self._notify(msg)
        try:
            from omniworker_cli import kanban_db

            if hasattr(kanban_db, "block_task"):
                kanban_db.block_task(self.kanban_conn, task_id, reason="loop_detection")
        except Exception as exc:  # noqa: BLE001
            logger.debug("Could not block escalated task %s: %s", task_id, exc)

    def _record_telemetry(self, task_id, agent_type, model, in_tok, out_tok, status, duration_s) -> None:
        """Append a run record for observability (best-effort)."""
        try:
            from agent.orchestrator_telemetry import record_run
            from agent.orchestrator_budget import estimate_cost_usd

            cost = estimate_cost_usd(model=model, input_tokens=in_tok, output_tokens=out_tok)
            record_run(
                task_id=task_id, agent_type=agent_type, model=model,
                input_tokens=in_tok, output_tokens=out_tok, cost_usd=cost,
                status=status, duration_s=duration_s,
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("telemetry record failed: %s", exc)

    # ── autolearning hooks (Phase 4) ────────────────────────────────────────

    def _check_skill_proposal(self, task: Any) -> None:
        """Propose a skill when the same task pattern recurs (default 3×).

        Uses the shared persistent tracker (survives restarts, shared with the
        chat). Fires exactly once per bucket and only when no skill covers it.
        The proposal is a human-approved nudge — never unilateral creation.
        """
        text = getattr(task, "title", "") or ""
        bucket = _task_bucket(task)
        try:
            from agent.autolearn_tracker import AutolearnTracker

            if self._autolearn is None:
                self._autolearn = AutolearnTracker()
            if not self._autolearn.record_and_check(text, threshold=self.config.skill_propose_after):
                return
        except Exception:  # noqa: BLE001 — fall back to in-memory on any error
            self._skill_counts[bucket] = self._skill_counts.get(bucket, 0) + 1
            if self._skill_counts[bucket] != self.config.skill_propose_after:
                return
        if _skill_exists_for(bucket):
            return
        self._notify(
            f"💡 Patrón repetido {self.config.skill_propose_after}× ('{bucket}'). "
            f"¿Crear un skill para automatizarlo? (autolearning)"
        )

    def _check_agent_proposal(self, task: Any) -> None:
        if self.usage_tracker is None:
            return
        try:
            from agent.agent_proposals import maybe_propose

            # The "task_type" key is the classifier's view of the work. We reuse
            # the kanban title's leading words as a stable bucket.
            task_type = _task_bucket(task)
            maybe_propose(
                task_type,
                self.usage_tracker,
                nudge_after_uses=self.config.nudge_after_uses,
                examples=[getattr(task, "title", "")],
                notify_operator=self.notify_fn,
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("agent proposal check failed: %s", exc)

    # ── cron scheduling ─────────────────────────────────────────────────────

    def _due_cron_tasks(self) -> List[Dict[str, Any]]:
        due = []
        now = time.time()
        for cron in self.cron_tasks:
            if self._cron_is_due(cron, now):
                due.append(cron)
        return due

    def _cron_is_due(self, cron: Dict[str, Any], now: float) -> bool:
        """Minimal cron check via croniter when available; else interval fallback.

        Production installs have ``croniter`` (used by cron/scheduler.py). When
        absent (or for tests), an ``interval_seconds`` key gives a simple timer.
        """
        key = self._cron_key(cron)
        last = self._last_cron_run.get(key, 0.0)
        interval = cron.get("interval_seconds")
        if interval:
            return (now - last) >= float(interval)
        schedule = cron.get("schedule")
        if not schedule:
            return False
        try:
            from croniter import croniter

            base = last or (now - self.config.poll_interval)
            nxt = croniter(schedule, base).get_next(float)
            return nxt <= now
        except Exception:  # noqa: BLE001 — croniter missing or bad expr
            return False

    def _cron_key(self, cron: Dict[str, Any]) -> str:
        return f"{cron.get('task')}|{cron.get('schedule') or cron.get('interval_seconds')}"

    # ── misc ────────────────────────────────────────────────────────────────

    def _notify_budget_once(self, message: str) -> None:
        """Notify the operator about a budget pause/halt, once per episode."""
        if not self._budget_notified:
            self._notify(message)
            self._budget_notified = True

    def _notify(self, message: str) -> None:
        if self.notify_fn:
            try:
                self.notify_fn(message)
                return
            except Exception as exc:  # noqa: BLE001
                logger.warning("notify_fn failed: %s", exc)
        logger.warning("[operator-notify] %s", message)


# ── helpers ─────────────────────────────────────────────────────────────────


def _truncate(s: str, n: int) -> str:
    s = s or ""
    return s if len(s) <= n else s[: n - 1] + "…"


def _extract_usage(summary: Any) -> Tuple[Optional[str], int, int]:
    """Best-effort (model, input_tokens, output_tokens) from a delegate result.

    ``delegate_task`` returns a JSON string whose entries carry a ``tokens``
    block and ``model``. Plain-text summaries (or parse failures) yield zeros —
    the delegation still counts against the count cap, which is the hard rail.
    """
    if not isinstance(summary, str):
        return None, 0, 0
    try:
        import json

        data = json.loads(summary)
    except Exception:  # noqa: BLE001
        return None, 0, 0

    # Accept either a single entry dict or a list of task entries.
    entries = data if isinstance(data, list) else [data]
    model: Optional[str] = None
    in_tok = out_tok = 0
    for e in entries:
        if not isinstance(e, dict):
            continue
        model = model or (e.get("model") if isinstance(e.get("model"), str) else None)
        tok = e.get("tokens") or {}
        if isinstance(tok, dict):
            in_tok += int(tok.get("input", 0) or 0)
            out_tok += int(tok.get("output", 0) or 0)
    return model, in_tok, out_tok


def _task_bucket(task: Any) -> str:
    """Stable task-type bucket from a kanban title (first 4 significant words)."""
    title = (getattr(task, "title", "") or "").lower().strip()
    words = [w for w in title.split() if len(w) > 2][:4]
    return " ".join(words) or "general"


def _skill_exists_for(bucket: str) -> bool:
    """Best-effort check whether a skill already covers this task bucket."""
    try:
        from tools.skills_tool import skills_list

        listing = skills_list()  # name + description listing
        text = (listing if isinstance(listing, str) else str(listing)).lower()
        # A loose containment check: any significant word of the bucket present.
        return all(w in text for w in bucket.split() if len(w) > 3) and bool(bucket.strip())
    except Exception:  # noqa: BLE001 — degrade to "no skill" so we still propose
        return False


def _record_failure(kanban_db, conn, task_id: str, error: str) -> None:
    """Best-effort failure record across kanban API variants."""
    for fn_name in ("record_task_failure", "fail_task", "mark_failed"):
        fn = getattr(kanban_db, fn_name, None)
        if callable(fn):
            try:
                fn(conn, task_id, error=_truncate(error, 500))
                return
            except TypeError:
                try:
                    fn(conn, task_id)
                    return
                except Exception:  # noqa: BLE001
                    pass
            except Exception:  # noqa: BLE001
                pass
    logger.debug("No kanban failure-recording fn available for %s", task_id)


# ── production wiring ─────────────────────────────────────────────────────────


def _parallel_instances_for(agent_type: str, complexity: Optional[str]) -> int:
    """How many blind instances this agent runs (judgment-day). Default 1."""
    try:
        from agent.agent_registry import get_agent_for_task

        return max(1, int(get_agent_for_task(agent_type, complexity=complexity).parallel_instances or 1))
    except Exception:  # noqa: BLE001
        return 1


def build_delegate_fn(orchestrator_agent) -> Callable[..., str]:
    """Return a ``delegate_fn`` that drives the real ``delegate_task``.

    ``orchestrator_agent`` is a long-lived AIAgent built from the orchestrator
    registry entry (broad toolset so workers aren't toolset-starved by the
    parent-intersection rule). Each call spawns a registry worker and returns
    its summary string.

    **Judgment-day:** agents with ``parallel_instances > 1`` (e.g. the reviewer)
    are expanded into N identical tasks. ``delegate_task``'s batch path runs them
    in parallel with isolated contexts — i.e. blind to each other — and returns
    all N verdicts for the orchestrator to consolidate.
    """
    from tools.delegate_tool import delegate_task

    def _delegate(*, agent_type: str, goal: str, context: Optional[str] = None,
                  complexity: Optional[str] = None) -> str:
        n = _parallel_instances_for(agent_type, complexity)
        if n > 1:
            tasks = [
                {"goal": goal, "context": context, "agent_type": agent_type, "complexity": complexity}
                for _ in range(n)
            ]
            return delegate_task(tasks=tasks, role="leaf", parent_agent=orchestrator_agent)
        return delegate_task(
            goal=goal,
            context=context,
            agent_type=agent_type,
            complexity=complexity,
            role="leaf",
            parent_agent=orchestrator_agent,
        )

    return _delegate


def build_orchestrator_agent(*, quiet: bool = True):
    """Construct the long-lived orchestrator AIAgent from the registry entry.

    Resolves the ``orchestrator`` agent's provider/model through the runtime
    provider system and boots an AIAgent with the orchestrator system prompt.
    The toolset is left broad (``enabled_toolsets=None`` = all) on purpose: the
    orchestrator *prompt* makes it delegate rather than execute, and a broad
    ceiling means workers aren't starved by the parent-intersection rule when
    they request specialised toolsets.
    """
    from agent.agent_registry import get_agent_for_task, load_system_prompt
    from omniworker_cli.runtime_provider import resolve_runtime_provider
    from run_agent import AIAgent

    cfg = get_agent_for_task("orchestrator")
    runtime = resolve_runtime_provider(requested=cfg.provider, target_model=cfg.model)
    system_prompt = load_system_prompt(cfg.system_prompt)

    return AIAgent(
        base_url=runtime.get("base_url"),
        api_key=runtime.get("api_key"),
        provider=runtime.get("provider") or cfg.provider,
        api_mode=runtime.get("api_mode"),
        model=cfg.model or runtime.get("model") or "",
        max_iterations=cfg.max_iterations,
        enabled_toolsets=None,  # broad ceiling — see docstring
        quiet_mode=quiet,
        ephemeral_system_prompt=system_prompt or None,
    )


def build_orchestrator_daemon(
    *,
    kanban_conn=None,
    orchestrator_agent=None,
    notify_fn: Optional[Callable[[str], None]] = None,
    config: Optional[DaemonConfig] = None,
) -> OrchestratorDaemon:
    """Construct a production daemon wired to kanban + a real orchestrator agent.

    ``orchestrator_agent`` must be provided (built by the gateway/CLI from the
    orchestrator registry entry). ``kanban_conn`` defaults to the active board.
    """
    if kanban_conn is None:
        from omniworker_cli import kanban_db

        kanban_conn = kanban_db.connect()

    if orchestrator_agent is None:
        orchestrator_agent = build_orchestrator_agent()

    usage_tracker = None
    try:
        from agent.agent_proposals import UsageTracker

        usage_tracker = UsageTracker(conn=getattr(orchestrator_agent, "_session_db", None))
    except Exception as exc:  # noqa: BLE001
        logger.debug("UsageTracker unavailable: %s", exc)

    # Spend rail + kill-switch from config.yaml (orchestrator.budget block).
    budget = None
    try:
        from agent.orchestrator_budget import BudgetConfig, BudgetGuard

        _cfg = {}
        try:
            import yaml as _yaml
            from omniworker_cli.config import get_omniworker_home

            _cfg_path = get_omniworker_home() / "config.yaml"
            if _cfg_path.exists():
                _cfg = _yaml.safe_load(_cfg_path.read_text(encoding="utf-8")) or {}
        except Exception:  # noqa: BLE001
            _cfg = {}
        budget = BudgetGuard(BudgetConfig.from_config(_cfg))
    except Exception as exc:  # noqa: BLE001 — budget is optional
        logger.debug("budget guard not wired: %s", exc)

    daemon = OrchestratorDaemon(
        kanban_conn=kanban_conn,
        delegate_fn=build_delegate_fn(orchestrator_agent),
        notify_fn=notify_fn,
        config=config or DaemonConfig(),
        usage_tracker=usage_tracker,
        budget=budget,
    )

    # Model-catalog auto-update: a daily cron polls provider catalogs and applies
    # minor model bumps automatically (major changes file a triage kanban task).
    try:
        from agent.model_catalog import build_kanban_notifier, run_catalog_check

        catalog_notifier = build_kanban_notifier(kanban_conn)
        daemon.catalog_check_fn = lambda: run_catalog_check(notify_operator=catalog_notifier)
        daemon.cron_tasks.append(
            {"task": "model_catalog_check", "kind": "catalog", "schedule": "0 8 * * *"}
        )
    except Exception as exc:  # noqa: BLE001 — catalog auto-update is optional
        logger.debug("model-catalog auto-update not wired: %s", exc)

    # Default scheduled tasks (the autonomous cadence). Each delegates to the
    # right specialist; operators can edit these on the daemon instance.
    daemon.cron_tasks.extend([
        {"task": "Revisión semanal: estado del kanban y prioridades de la semana",
         "agent_type": "planner", "schedule": "0 9 * * 1"},      # Lunes 9:00
        {"task": "Standup diario: resumir progreso y bloqueos del board",
         "agent_type": "planner", "schedule": "0 8 * * *"},      # Diario 8:00
        {"task": "Revisión de autolearning: patrones repetidos → skills/agentes",
         "agent_type": "planner", "schedule": "0 18 * * 5"},     # Viernes 18:00
    ])

    return daemon


# ── standalone entrypoint ─────────────────────────────────────────────────────


def main() -> int:
    """Run the orchestrator daemon standalone.

    Builds the orchestrator agent + kanban connection from the registry and
    polls forever. The gateway can instead call ``build_orchestrator_daemon()``
    and ``.start()`` to run it in-process (see ORCHESTRATOR-IMPLEMENTATION.md).
    """
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [orchestrator-daemon] %(levelname)s %(message)s",
    )
    parser = argparse.ArgumentParser(description="OmniWorker orchestrator daemon")
    parser.add_argument("--poll", type=float, default=30.0, help="poll interval seconds")
    parser.add_argument("--once", action="store_true", help="run a single tick and exit")
    args = parser.parse_args()

    daemon = build_orchestrator_daemon(config=DaemonConfig(poll_interval=args.poll))
    if args.once:
        result = daemon.tick()
        logger.info("tick result: %s", result)
        return 0

    daemon.start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        daemon.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
