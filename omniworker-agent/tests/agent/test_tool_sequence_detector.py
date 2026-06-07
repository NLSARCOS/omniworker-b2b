"""Tests for agent/tool_sequence_detector.py — recurring tool-call pattern detection."""

import json
import pytest
import time
from agent.tool_sequence_detector import (
    _normalize_sequence,
    _sequence_similarity,
    _parse_tool_calls,
    _make_sequence_hash,
    cluster_tool_sequences,
    _score_sequence_cluster,
    ToolSequence,
)


class TestNormalizeSequence:
    def test_too_short_returns_empty(self):
        assert _normalize_sequence(["web_search"]) == []

    def test_exact_length_two_passes(self):
        assert _normalize_sequence(["a", "b"]) == ["a", "b"]

    def test_drops_triple_contiguous_repeat(self):
        # Third+ contiguous repeat dropped
        assert _normalize_sequence(["x", "x", "x", "y"]) == ["x", "x", "y"]

    def test_caps_at_max_length(self):
        long = [f"t{i}" for i in range(12)]
        result = _normalize_sequence(long)
        assert len(result) == 8

    def test_keeps_non_contiguous_repeats(self):
        assert _normalize_sequence(["a", "b", "a"]) == ["a", "b", "a"]


class TestSequenceSimilarity:
    def test_exact_match(self):
        assert _sequence_similarity(["a", "b"], ["a", "b"]) == 1.0

    def test_completely_different(self):
        sim = _sequence_similarity(["a", "b"], ["x", "y", "z"])
        assert sim < 0.5

    def test_partial_overlap(self):
        sim = _sequence_similarity(["web_search", "web_extract"], ["web_search", "web_extract", "read_file"])
        assert 0.5 < sim < 1.0


class TestParseToolCalls:
    def test_empty(self):
        assert _parse_tool_calls("") == []

    def test_json_array_with_function_objects(self):
        data = [
            {"function": {"name": "web_search", "arguments": "{}"}},
            {"function": {"name": "web_extract", "arguments": "{}"}},
        ]
        assert _parse_tool_calls(json.dumps(data)) == ["web_search", "web_extract"]

    def test_fallback_name_field(self):
        data = [{"name": "memory", "arguments": "{}"}]
        assert _parse_tool_calls(json.dumps(data)) == ["memory"]

    def test_heuristic_tool_calls_string(self):
        text = 'tool_calls: [{"name": "terminal"}, {"name": "read_file"}]'
        names = _parse_tool_calls(text)
        assert "terminal" in names
        assert "read_file" in names


class TestClusterToolSequences:
    def test_single_cluster_exact_matches(self):
        seqs = [
            ToolSequence(["a", "b", "c"], "s1", time.time(), "u1", "cli"),
            ToolSequence(["a", "b", "c"], "s2", time.time(), "u1", "cli"),
            ToolSequence(["a", "b", "c"], "s3", time.time(), "u1", "cli"),
        ]
        clusters = cluster_tool_sequences(seqs, similarity_threshold=0.80)
        assert len(clusters) == 1
        assert clusters[0].count == 3
        assert clusters[0].canonical_sequence == ["a", "b", "c"]

    def test_two_distinct_clusters(self):
        seqs = [
            ToolSequence(["a", "b"], "s1", time.time(), "u1", "cli"),
            ToolSequence(["a", "b"], "s2", time.time(), "u1", "cli"),
            ToolSequence(["x", "y"], "s3", time.time(), "u1", "cli"),
            ToolSequence(["x", "y"], "s4", time.time(), "u1", "cli"),
        ]
        clusters = cluster_tool_sequences(seqs, similarity_threshold=0.80)
        assert len(clusters) == 2

    def test_ignores_short_sequences(self):
        seqs = [
            ToolSequence(["a"], "s1", time.time(), "u1", "cli"),
            ToolSequence(["a"], "s2", time.time(), "u1", "cli"),
        ]
        clusters = cluster_tool_sequences(seqs)
        assert len(clusters) == 0


class TestScoreSequenceCluster:
    def test_low_occurrence_returns_zero(self):
        cluster = cluster_tool_sequences([
            ToolSequence(["a", "b"], "s1", time.time(), "u1", "cli"),
            ToolSequence(["a", "b"], "s2", time.time(), "u1", "cli"),
        ])[0]
        score = _score_sequence_cluster(cluster)
        assert score == 0.0  # less than 3 occurrences

    def test_high_occurrence_high_score(self):
        now = time.time()
        seqs = [
            ToolSequence(["a", "b", "c", "d"], f"s{i}", now, "u1", "cli")
            for i in range(6)
        ]
        clusters = cluster_tool_sequences(seqs)
        assert len(clusters) == 1
        score = _score_sequence_cluster(clusters[0])
        assert score >= 0.7

    def test_old_sequences_score_lower(self):
        now = time.time()
        old = now - (20 * 86400)  # 20 days ago
        seqs = [
            ToolSequence(["a", "b", "c"], f"s{i}", old, "u1", "cli")
            for i in range(5)
        ]
        clusters = cluster_tool_sequences(seqs)
        score = _score_sequence_cluster(clusters[0])
        assert score < 0.9  # recency penalty


class TestMakeSequenceHash:
    def test_deterministic(self):
        h1 = _make_sequence_hash(["a", "b", "c"])
        h2 = _make_sequence_hash(["a", "b", "c"])
        assert h1 == h2
        assert len(h1) == 16

    def test_different_sequences_different_hashes(self):
        h1 = _make_sequence_hash(["a", "b"])
        h2 = _make_sequence_hash(["b", "a"])
        assert h1 != h2
