#!/usr/bin/env python3
"""Live end-to-end smoke for the orchestrator — hits a REAL model.

Unlike the hermetic pytest suite (which strips provider keys on purpose), this
script runs against the actual environment: it builds the real orchestrator
agent from the registry and delegates a trivial task to a real worker, proving
the full path — orchestrator → registry worker → real model → structured
summary integrated back.

Usage
-----
    # uses ~/.omniworker/.env credentials
    python scripts/verify_orchestrator_live.py

    # or pass a key inline (kimi path: orchestrator + general_agent[complex])
    KIMI_API_KEY=sk-... python scripts/verify_orchestrator_live.py

Exit code 0 = a real, non-error delegation came back. Non-zero = failure.
"""

import os
import sys
import time

# Make the omniworker-agent package root importable when run from scripts/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    from orchestrator_daemon import build_orchestrator_agent, build_delegate_fn

    t0 = time.time()
    print("→ Construyendo agente orquestador (kimi-k2)…")
    orch = build_orchestrator_agent(quiet=True)
    print(f"  ✓ {time.time()-t0:.1f}s · provider={orch.provider} model={orch.model}")

    print("→ Delegando a general_agent (complexity=complex → kimi-k2)…")
    delegate = build_delegate_fn(orch)
    t1 = time.time()
    result = delegate(
        agent_type="general_agent",
        goal="Responde con exactamente la palabra: OK. Nada más.",
        complexity="complex",
    )
    dt = time.time() - t1
    print(f"  ✓ delegación en {dt:.1f}s")
    print("\n=== RESULTADO ===")
    print(result[:1500] if isinstance(result, str) else result)

    ok = isinstance(result, str) and result.strip() and '"error"' not in result
    print("\n" + ("✅ PASS — delegación real e integrada" if ok else "❌ FAIL — error o vacío"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
