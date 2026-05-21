"""Tests for the Pattern Engine.

Hermetic: no real DB, no external APIs, no LLM calls.
"""

import time
from typing import List

import pytest

from agent.pattern_engine import (
    DetectedPattern,
    PatternCluster,
    UserMessage,
    _compute_similarity,
    _is_excluded_prompt,
    _normalize_prompt,
    _analyze_temporal,
    _score_pattern,
    cluster_messages,
    scan_for_patterns,
)


class TestNormalization:
    def test_normalize_lowercase_and_strip(self):
        assert _normalize_prompt("  HELLO World  ") == "hello world"

    def test_normalize_removes_dates(self):
        assert _normalize_prompt("report for 2025-05-20") == "report for"

    def test_normalize_removes_times(self):
        # "today" is also a relative date and gets stripped for clustering purposes
        assert _normalize_prompt("meeting at 14:30 today") == "meeting at"

    def test_normalize_removes_urls(self):
        assert _normalize_prompt("check https://example.com/news") == "check"

    def test_normalize_removes_code_blocks(self):
        assert _normalize_prompt("review this: ```python\nprint(1)\n```") == "review this:"

    def test_normalize_collapses_whitespace(self):
        assert _normalize_prompt("hello    world\n\n  foo") == "hello world foo"


class TestExclusions:
    def test_short_prompts_excluded(self):
        assert _is_excluded_prompt("hi") is True
        assert _is_excluded_prompt("ok") is True

    def test_greetings_excluded(self):
        assert _is_excluded_prompt("hola") is True
        assert _is_excluded_prompt("gracias") is True

    def test_real_prompts_allowed(self):
        assert _is_excluded_prompt("generate a daily report for sales") is False
        assert _is_excluded_prompt("summarize the latest PR changes") is False

    def test_empty_none_excluded(self):
        assert _is_excluded_prompt("") is True
        assert _is_excluded_prompt(None) is True  # type: ignore[arg-type]


class TestSimilarity:
    def test_exact_match(self):
        assert _compute_similarity("hello world", "hello world") == 1.0

    def test_completely_different(self):
        assert _compute_similarity("abc", "xyz") < 0.3

    def test_similar_phrases(self):
        score = _compute_similarity(
            "generate daily report",
            "generate the daily report",
        )
        assert score > 0.8

    def test_empty_inputs(self):
        assert _compute_similarity("", "hello") == 0.0
        assert _compute_similarity("hello", "") == 0.0


class TestClustering:
    def test_single_cluster_for_identical(self):
        now = time.time()
        msgs: List[UserMessage] = [
            UserMessage("daily report", "daily report", now, "s1", "cli", "c1", "u1"),
            UserMessage("daily report", "daily report", now + 3600, "s2", "cli", "c1", "u1"),
        ]
        clusters = cluster_messages(msgs, similarity_threshold=0.82)
        assert len(clusters) == 1
        assert clusters[0].count == 2

    def test_separate_clusters_for_different(self):
        now = time.time()
        msgs: List[UserMessage] = [
            UserMessage("daily report", "daily report", now, "s1", "cli", "c1", "u1"),
            UserMessage("weather forecast", "weather forecast", now + 3600, "s2", "cli", "c1", "u1"),
        ]
        clusters = cluster_messages(msgs, similarity_threshold=0.82)
        assert len(clusters) == 2

    def test_threshold_splits_clusters(self):
        now = time.time()
        msgs: List[UserMessage] = [
            UserMessage("daily report", "daily report", now, "s1", "cli", "c1", "u1"),
            UserMessage("weekly report", "weekly report", now + 3600, "s2", "cli", "c1", "u1"),
        ]
        # With high threshold they should split
        clusters = cluster_messages(msgs, similarity_threshold=0.95)
        assert len(clusters) == 2


class TestTemporalAnalysis:
    def test_daily_pattern(self):
        now = time.time()
        # Three messages at 9:00 AM on consecutive days
        timestamps = [
            now - 2 * 86400,
            now - 86400,
            now,
        ]
        # Force hour to 9 for all
        for i, ts in enumerate(timestamps):
            # adjust to 9:00 local time
            local = time.localtime(ts)
            offset = (9 - local.tm_hour) * 3600
            timestamps[i] = ts + offset

        cluster = PatternCluster("hash", "daily report", [
            UserMessage("daily report", "daily report", ts, "s", "cli", "c", "u")
            for ts in timestamps
        ])
        schedule, regularity, meta = _analyze_temporal(cluster)
        assert schedule is not None
        assert "9" in schedule
        assert regularity > 0.5

    def test_no_schedule_with_single_message(self):
        now = time.time()
        cluster = PatternCluster("hash", "report", [
            UserMessage("report", "report", now, "s", "cli", "c", "u"),
        ])
        schedule, regularity, meta = _analyze_temporal(cluster)
        assert schedule is None
        assert regularity == 0.0

    def test_interval_pattern_every_30m(self):
        now = time.time()
        cluster = PatternCluster("hash", "ping", [
            UserMessage("ping", "ping", now - 1800 * i, "s", "cli", "c", "u")
            for i in range(3)
        ])
        schedule, regularity, meta = _analyze_temporal(cluster)
        assert schedule == "30m"


class TestScoring:
    def test_high_confidence_for_strong_pattern(self):
        now = time.time()
        cluster = PatternCluster("hash", "daily report", [
            UserMessage("daily report", "daily report", now - 2 * 86400, "s", "cli", "c", "u"),
            UserMessage("daily report", "daily report", now - 86400, "s", "cli", "c", "u"),
            UserMessage("daily report", "daily report", now, "s", "cli", "c", "u"),
        ])
        schedule, regularity, meta = _analyze_temporal(cluster)
        confidence = _score_pattern(cluster, schedule, regularity, meta)
        assert confidence >= 0.7

    def test_low_confidence_for_sparse_pattern(self):
        now = time.time()
        cluster = PatternCluster("hash", "rare task", [
            UserMessage("rare task", "rare task", now - 30 * 86400, "s", "cli", "c", "u"),
            UserMessage("rare task", "rare task", now, "s", "cli", "c", "u"),
        ])
        schedule, regularity, meta = _analyze_temporal(cluster)
        confidence = _score_pattern(cluster, schedule, regularity, meta)
        # Sparse patterns with only 2 occurrences should have low-to-medium confidence
        assert confidence < 0.8


class TestScanForPatterns:
    def test_detects_temporal_pattern(self):
        now = time.time()
        msgs: List[UserMessage] = [
            UserMessage(
                "generate daily sales report",
                _normalize_prompt("generate daily sales report"),
                now - 2 * 86400,
                "s1", "cli", "c1", "u1",
            ),
            UserMessage(
                "generate daily sales report",
                _normalize_prompt("generate daily sales report"),
                now - 86400,
                "s2", "cli", "c1", "u1",
            ),
            UserMessage(
                "generate daily sales report",
                _normalize_prompt("generate daily sales report"),
                now,
                "s3", "cli", "c1", "u1",
            ),
        ]
        patterns = scan_for_patterns(msgs, similarity_threshold=0.82)
        assert len(patterns) >= 1
        pat = patterns[0]
        assert pat.canonical_prompt == "generate daily sales report"
        assert pat.occurrence_count == 3
        assert pat.confidence >= 0.5

    def test_ignores_excluded_prompts(self):
        now = time.time()
        msgs: List[UserMessage] = [
            UserMessage("hola", _normalize_prompt("hola"), now, "s1", "cli", "c1", "u1"),
            UserMessage("hola", _normalize_prompt("hola"), now + 3600, "s2", "cli", "c1", "u1"),
            UserMessage("hola", _normalize_prompt("hola"), now + 7200, "s3", "cli", "c1", "u1"),
        ]
        patterns = scan_for_patterns(msgs)
        assert len(patterns) == 0

    def test_empty_input(self):
        assert scan_for_patterns([]) == []


class TestDetectedPatternDataclass:
    def test_basic_creation(self):
        now = time.time()
        pat = DetectedPattern(
            pattern_hash="abc123",
            pattern_type="temporal",
            canonical_prompt="test prompt",
            sample_prompts=["test prompt"],
            schedule_inferred="0 9 * * *",
            confidence=0.9,
            occurrence_count=3,
            first_seen_at=now,
            last_seen_at=now,
            status="detected",
            auto_created_job_id=None,
            user_id="u1",
            source_platform="cli",
            source_chat_id="c1",
        )
        assert pat.pattern_hash == "abc123"
        assert pat.confidence == 0.9
