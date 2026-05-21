import { useState, useEffect, useCallback } from "react";
import {
  Refresh,
  Check,
  X,
  Zap,
  Brain,
  Alert,
} from "../../assets/icons";
import { useI18n } from "../../components/useI18n";

interface DetectedPattern {
  id: string;
  canonical_prompt: string;
  pattern_type: string;
  schedule_inferred: string | null;
  confidence: number;
  occurrence_count: number;
  status: string;
  first_seen_at: number;
  last_seen_at: number;
  auto_created_job_id: string | null;
}

interface SmartPatternsProps {
  profile?: string;
}

function SmartPatterns({ profile }: SmartPatternsProps): React.JSX.Element {
  const { t } = useI18n();
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [autoLearningEnabled, setAutoLearningEnabled] = useState(true);

  const loadPatterns = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const list = await window.omniworkerAPI.listDetectedPatterns(profile);
      setPatterns(list);
      setError("");
    } catch (err) {
      console.error("[SmartPatterns] load failed:", err);
      setError(t("smartpatterns.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [profile, t]);

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns]);

  async function handleApprove(patternId: string): Promise<void> {
    setActionInProgress(patternId);
    setError("");
    try {
      const result = await window.omniworkerAPI.approvePattern(patternId, profile);
      if (result.success) {
        await loadPatterns();
      } else {
        setError(result.error || "Failed to approve pattern");
      }
    } catch {
      setError("Failed to approve pattern");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleReject(patternId: string): Promise<void> {
    setActionInProgress(patternId);
    setError("");
    try {
      const result = await window.omniworkerAPI.rejectPattern(patternId, profile);
      if (result.success) {
        await loadPatterns();
      } else {
        setError(result.error || "Failed to reject pattern");
      }
    } catch {
      setError("Failed to reject pattern");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggleAutoLearning(): Promise<void> {
    const next = !autoLearningEnabled;
    setAutoLearningEnabled(next);
    try {
      await window.omniworkerAPI.toggleAutoLearning(next, profile);
    } catch (err) {
      console.error("[SmartPatterns] toggle failed:", err);
    }
  }

  function formatTime(ts: number): string {
    try {
      return new Date(ts * 1000).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function confidenceBar(confidence: number): string {
    const filled = Math.round(confidence * 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  }

  if (loading) {
    return (
      <div className="smartpatterns-container">
        <div className="smartpatterns-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="smartpatterns-container">
      <div className="smartpatterns-header">
        <div>
          <h2 className="smartpatterns-title">{t("smartpatterns.title")}</h2>
          <p className="smartpatterns-subtitle">{t("smartpatterns.subtitle")}</p>
        </div>
        <div className="smartpatterns-header-actions">
          <button
            className={`btn ${autoLearningEnabled ? "btn-primary" : "btn-secondary"}`}
            onClick={handleToggleAutoLearning}
          >
            <Brain size={14} />
            {autoLearningEnabled
              ? t("smartpatterns.autoLearningOn")
              : t("smartpatterns.autoLearningOff")}
          </button>
          <button className="btn btn-secondary" onClick={loadPatterns}>
            <Refresh size={14} />
            {t("smartpatterns.refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div className="skills-error">
          {error}
          <button className="btn-ghost" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {patterns.length === 0 ? (
        <div className="smartpatterns-empty">
          <p className="smartpatterns-empty-text">{t("smartpatterns.empty")}</p>
          <p className="smartpatterns-empty-hint">{t("smartpatterns.emptyHint")}</p>
        </div>
      ) : (
        <div className="smartpatterns-list">
          {patterns.map((pat) => (
            <div key={pat.id} className="smartpatterns-card">
              <div className="smartpatterns-card-top">
                <div className="smartpatterns-card-info">
                  <div className="smartpatterns-card-prompt">
                    {pat.canonical_prompt}
                  </div>
                  <div className="smartpatterns-card-meta">
                    {pat.schedule_inferred && (
                      <span className="smartpatterns-schedule">
                        ⏰ {pat.schedule_inferred}
                      </span>
                    )}
                    <span>
                      {t("smartpatterns.occurrences")}: {pat.occurrence_count}
                    </span>
                    <span>
                      {t("smartpatterns.lastSeen")}: {formatTime(pat.last_seen_at)}
                    </span>
                  </div>
                </div>
                <div className="smartpatterns-card-actions">
                  <span
                    className={`schedules-badge schedules-badge-${
                      pat.status === "active"
                        ? "active"
                        : pat.status === "rejected"
                          ? "paused"
                          : "completed"
                    }`}
                  >
                    {pat.status}
                  </span>
                  {pat.status !== "active" && (
                    <button
                      className="btn-ghost schedules-action-btn"
                      data-tooltip={t("smartpatterns.approve")}
                      onClick={() => handleApprove(pat.id)}
                      disabled={actionInProgress === pat.id}
                    >
                      <Check size={14} />
                    </button>
                  )}
                  {pat.status !== "rejected" && (
                    <button
                      className="btn-ghost schedules-action-btn schedules-action-danger"
                      data-tooltip={t("smartpatterns.reject")}
                      onClick={() => handleReject(pat.id)}
                      disabled={actionInProgress === pat.id}
                    >
                      <X size={14} />
                    </button>
                  )}
                  {pat.status === "active" && pat.auto_created_job_id && (
                    <button
                      className="btn-ghost schedules-action-btn"
                      data-tooltip={t("smartpatterns.triggerNow")}
                      onClick={async () => {
                        try {
                          await window.omniworkerAPI.triggerCronJob(
                            pat.auto_created_job_id!,
                            profile
                          );
                        } catch (err) {
                          console.error("Trigger failed:", err);
                        }
                      }}
                    >
                      <Zap size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="smartpatterns-confidence">
                <span className="smartpatterns-confidence-label">
                  {t("smartpatterns.confidence")}:
                </span>
                <span className="smartpatterns-confidence-bar">
                  {confidenceBar(pat.confidence)}
                </span>
                <span className="smartpatterns-confidence-value">
                  {Math.round(pat.confidence * 100)}%
                </span>
              </div>

              {pat.auto_created_job_id && (
                <div className="smartpatterns-card-footer">
                  <Alert size={12} />
                  <span>
                    {t("smartpatterns.autoJob")}: {pat.auto_created_job_id}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartPatterns;
