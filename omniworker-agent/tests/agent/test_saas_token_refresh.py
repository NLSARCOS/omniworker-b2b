"""Tests for SaaS token refresh features: proactive checks, reactive checks, and routing key dynamic lookup."""

import base64
import json
import os
import time
from unittest.mock import patch, MagicMock

import pytest
from run_agent import AIAgent
from intent_classifier import get_routing_config

def make_jwt(exp_timestamp):
    payload = {"exp": exp_timestamp}
    payload_b64 = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8").replace("=", "")
    return f"eyJhbGciOiJSUzI1NiJ9.{payload_b64}.signature"


class TestSaaSTokenExpirationAndRefresh:
    def _make_agent(self, api_key=None):
        with patch.object(AIAgent, "__init__", lambda self, **kw: None):
            agent = AIAgent()
        agent.api_key = api_key
        agent._client_kwargs = {"api_key": api_key}
        agent._openai_client_lock = MagicMock()
        return agent

    def test_is_saas_token_expiring_soon(self):
        # 1. No token
        agent = self._make_agent(api_key=None)
        assert agent._is_saas_token_expiring_soon() is False

        # 2. Not a JWT token
        agent = self._make_agent(api_key="plain-text-token")
        assert agent._is_saas_token_expiring_soon() is False

        # 3. Valid JWT expiring far in future (1 hour)
        far_jwt = make_jwt(time.time() + 3600)
        agent = self._make_agent(api_key=far_jwt)
        assert agent._is_saas_token_expiring_soon() is False

        # 4. Valid JWT expiring soon (1 minute)
        near_jwt = make_jwt(time.time() + 60)
        agent = self._make_agent(api_key=near_jwt)
        assert agent._is_saas_token_expiring_soon() is True

        # 5. JWT with no exp claim
        no_exp_jwt = "eyJhbGciOiJSUzI1NiJ9.eyJuYW1lIjoiSm9obiJ9.signature"
        agent = self._make_agent(api_key=no_exp_jwt)
        assert agent._is_saas_token_expiring_soon() is False

    def test_ensure_primary_openai_client_proactive_refresh(self, monkeypatch):
        near_jwt = make_jwt(time.time() + 60)
        agent = self._make_agent(api_key=near_jwt)

        # Mock the refresh method and dependency checks
        mock_refresh = MagicMock(return_value=True)
        agent._try_refresh_saas_client_credentials = mock_refresh
        agent._replace_primary_openai_client = MagicMock(return_value=True)
        agent._is_openai_client_closed = MagicMock(return_value=False)
        agent.client = MagicMock()

        # Set environment variable so the proactive condition triggers
        monkeypatch.setenv("OMNIWORKER_SAAS_REFRESH_TOKEN", "dummy-refresh-token")

        # Mock get_latest_api_key to avoid side-effects
        with patch("smart_router.get_latest_api_key", return_value=None):
            client = agent._ensure_primary_openai_client(reason="test_proactive")

        # Must have called refresh because token was expiring soon
        mock_refresh.assert_called_once()
        assert client is not None

    def test_ensure_primary_openai_client_no_proactive_refresh_if_far(self, monkeypatch):
        far_jwt = make_jwt(time.time() + 3600)
        agent = self._make_agent(api_key=far_jwt)

        mock_refresh = MagicMock(return_value=True)
        agent._try_refresh_saas_client_credentials = mock_refresh
        agent._is_openai_client_closed = MagicMock(return_value=False)
        agent.client = MagicMock()

        monkeypatch.setenv("OMNIWORKER_SAAS_REFRESH_TOKEN", "dummy-refresh-token")

        with patch("smart_router.get_latest_api_key", return_value=None):
            client = agent._ensure_primary_openai_client(reason="test_proactive_far")

        # Must NOT have called refresh
        mock_refresh.assert_not_called()
        assert client is not None


class TestRoutingConfigDynamicKeys:
    def test_routing_config_uses_updated_keys(self, monkeypatch):
        # Test that get_routing_config respects keys set in environment dynamically
        # even if intent_classifier has already been imported.
        monkeypatch.setenv("OMNIWORKER_SAAS_BASE_URL", "http://saas.test/v1")
        monkeypatch.setenv("OMNIWORKER_SAAS_MODEL", "model-test")

        # Trigger intent classification using dynamic keys
        monkeypatch.setenv("OPENAI_API_KEY", "dynamic-key-123")
        base_url, model, api_key = get_routing_config("escribe el código", "http://default/v1", "default-model", "default-key")
        assert api_key == "dynamic-key-123"

        monkeypatch.setenv("OPENAI_API_KEY", "refreshed-key-456")
        base_url, model, api_key = get_routing_config("escribe el código", "http://default/v1", "default-model", "default-key")
        assert api_key == "refreshed-key-456"
