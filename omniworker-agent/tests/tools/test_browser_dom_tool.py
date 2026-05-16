import json
import pytest
from unittest.mock import patch, MagicMock

from tools.browser_dom_tool import (
    browser_dom_navigate,
    browser_dom_read,
    browser_dom_click,
    browser_dom_type,
    browser_dom_select,
    browser_dom_scroll,
    browser_dom_eval,
    browser_dom_close,
    _get_session,
    _DOM_CACHE,
)

@pytest.fixture(autouse=True)
def clean_cache():
    _DOM_CACHE.clear()
    yield
    _DOM_CACHE.clear()

def mock_eval_factory(responses):
    """
    Returns a mock for _browser_eval that returns the values from `responses` list in order.
    `responses` is a list of json strings like '{"success": true, "result": "..."}'
    """
    def side_effect(script, task_id):
        if not responses:
            return json.dumps({"success": True, "result": "default mocked res"})
        return responses.pop(0)
    return side_effect

@patch("tools.browser_tool.browser_navigate")
@patch("tools.browser_tool._get_session_info")
@patch("tools.browser_tool._browser_eval")
def test_browser_dom_navigate(mock_eval, mock_get_session, mock_nav):
    # Setup mocks
    mock_nav.return_value = "nav success"
    mock_get_session.return_value = {"cdp_url": "ws://foo"}
    
    # eval sequence: 
    # 1. install observer (returns observer_installed)
    # 2. extract dom (returns string)
    # 3. reset dirty (returns true)
    mock_eval.side_effect = mock_eval_factory([
        json.dumps({"success": True, "result": "observer_installed"}),
        json.dumps({"success": True, "result": "[0]<button>Login</button>"}),
        json.dumps({"success": True, "result": True}),
    ])
    
    res = browser_dom_navigate("https://example.com", task_id="test_nav")
    
    # Assertions
    assert "https://example.com" in res
    assert "[0]<button>Login" in res
    
    session = _get_session("test_nav")
    assert session["dirty"] is False
    assert session["url"] == "https://example.com"
    assert session["dom"] == "[0]<button>Login</button>"
    assert mock_nav.called

@patch("tools.browser_tool._get_session_info")
@patch("tools.browser_tool._run_browser_command") # url check inside read
@patch("tools.browser_tool._browser_eval")
def test_browser_dom_read_cached(mock_eval, mock_run_cmd, mock_get_session):
    mock_get_session.return_value = {"session_name": "t1"}
    
    # Populate cache as clean
    _DOM_CACHE["test_read"] = {
        "dom": "CACHED_DOM",
        "dirty": False,
        "url": "http://foo",
        "nav_count": 0
    }
    
    # check dirty eval returns false (string 'false')
    mock_eval.side_effect = mock_eval_factory([
        json.dumps({"success": True, "result": "false"}),
    ])
    
    res = browser_dom_read(task_id="test_read")
    
    # It should return cached string, no extraction ran
    assert res == "CACHED_DOM"
    # only one eval called (to check _is_page_dirty)
    assert mock_eval.call_count == 1

@patch("tools.browser_tool._get_session_info")
@patch("tools.browser_tool._browser_eval")
def test_browser_dom_click(mock_eval, mock_get_session):
    mock_get_session.return_value = {}
    
    mock_eval.side_effect = mock_eval_factory([
        json.dumps({"success": True, "result": "clicked [1]<button> Submit"}),
    ])
    
    res = browser_dom_click(1, task_id="test_click")
    assert "✅" in res
    assert "Submit" in res
    
    # Click should mark the cache as dirty
    assert _DOM_CACHE["test_click"]["dirty"] is True

@patch("tools.browser_tool._get_session_info")
@patch("tools.browser_tool._browser_eval")
def test_browser_dom_type(mock_eval, mock_get_session):
    mock_get_session.return_value = {}
    
    mock_eval.side_effect = mock_eval_factory([
        json.dumps({"success": True, "result": "typed into [2]: Hello world"}),
    ])
    
    res = browser_dom_type(2, "Hello world", task_id="test_type")
    assert "✅" in res
    assert "Hello world" in res
    assert _DOM_CACHE["test_type"]["dirty"] is True
