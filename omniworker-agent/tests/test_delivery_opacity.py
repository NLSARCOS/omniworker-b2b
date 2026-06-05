"""The delivery boundary must strip model/provider info from metadata.

`DeliveryRouter.deliver()` writes metadata to local files and forwards it to
platform adapters. Infrastructure fields must never reach those surfaces.
"""

import asyncio

from gateway.config import GatewayConfig
from gateway.delivery import DeliveryRouter, DeliveryTarget
from gateway.config import Platform


def _router(tmp_path):
    r = DeliveryRouter(config=GatewayConfig(), adapters={})
    r.output_dir = tmp_path
    return r


def test_local_delivery_strips_model_fields(tmp_path):
    router = _router(tmp_path)
    targets = [DeliveryTarget(platform=Platform.LOCAL)]
    metadata = {
        "agent": "marketer",
        "model": "glm-5",
        "provider": "opencode-go",
        "base_url": "https://opencode.ai/zen/go/v1",
        "task": "weekly recap",
    }
    results = asyncio.run(
        router.deliver("hello", targets, job_id="j1", job_name="Job", metadata=metadata)
    )
    [(_, res)] = results.items()
    assert res["success"] is True

    written = (tmp_path / "j1").glob("*.md")
    text = next(written).read_text()
    # Infra fields gone; business fields and humanised agent name present.
    assert "glm-5" not in text
    assert "opencode-go" not in text
    assert "opencode.ai" not in text
    assert "weekly recap" in text


def test_caller_metadata_not_mutated(tmp_path):
    router = _router(tmp_path)
    targets = [DeliveryTarget(platform=Platform.LOCAL)]
    metadata = {"model": "kimi-k2", "task": "x"}
    asyncio.run(router.deliver("hi", targets, job_id="j2", metadata=metadata))
    # redact_for_user returns a copy — caller's dict is untouched.
    assert metadata["model"] == "kimi-k2"
