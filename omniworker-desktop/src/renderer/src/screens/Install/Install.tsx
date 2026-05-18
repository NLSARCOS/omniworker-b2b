import { useEffect, useState, useRef } from "react";
import { ArrowRight, Copy, Send } from "../../assets/icons";

const TELEGRAM_COMMUNITY_URL = "https://t.me/omniworker_agent_desktop";
import { useI18n } from "../../components/useI18n";

interface InstallProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

interface InstallProps {
  onComplete: () => void;
  onFailed: (error: string) => void;
  authToken?: string | null;
}

function Install({
  onComplete,
  onFailed,
  authToken,
}: InstallProps): React.JSX.Element {
  const { t } = useI18n();
  const [progress, setProgress] = useState<InstallProgress>({
    step: 0,
    totalSteps: 7,
    title: t("install.preparing"),
    detail: t("install.startingInstall"),
    log: "",
  });
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const cleanup = window.omniworkerAPI.onInstallProgress((p) => {
      if (isMounted) setProgress(p);
    });

    window.omniworkerAPI
      .startInstall(authToken || undefined)
      .then(async (result) => {
        if (!isMounted) return;
        if (result.success) {
          try {
            const slmResult = await window.omniworkerAPI.startSlmDownload(authToken || undefined);
            if (!isMounted) return;
            if (slmResult.success) {
              setDone(true);
            } else {
              // Soft fail on SLM download, let them continue using cloud models
              console.error("SLM download failed:", slmResult.error);
              setProgress((p) => ({ ...p, log: p.log + `\nSLM download skipped: ${slmResult.error}` }));
              setDone(true);
            }
          } catch (err: any) {
            if (!isMounted) return;
            console.error("SLM download error:", err);
            setDone(true);
          }
        } else {
          setFailed(result.error || t("install.installationFailedHint"));
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setFailed(err.message || t("install.installationFailedHint"));
      });

    return () => {
      isMounted = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress.log]);

  function handleCopyLogs(): void {
    const text = `Installation Error:\n${failed}\n\n--- Full Log ---\n${progress.log}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const percent =
    progress.totalSteps > 0
      ? Math.round((progress.step / progress.totalSteps) * 100)
      : 0;

  return (
    <div className="screen install-screen">
      <h1 className="install-title">
        {done
          ? t("install.installationComplete")
          : failed
            ? t("install.installationFailed")
            : t("install.installingOmniWorker")}
      </h1>

      <div className="install-progress-container">
        <div className="install-progress-bar">
          <div
            className={`install-progress-fill ${failed ? "install-progress-fill--error" : ""}`}
            style={{ width: `${done ? 100 : percent}%` }}
          />
        </div>
        <div className="install-percent">{done ? "100" : percent}%</div>
      </div>

      {failed && (
        <div className="install-error-banner">
          <p className="install-error-text">{failed}</p>
          <div className="install-error-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setFailed(null);
                setProgress({
                  step: 0,
                  totalSteps: 7,
                  title: t("install.preparing"),
                  detail: t("install.startingInstall"),
                  log: "",
                });
                // Re-trigger install via parent
                onFailed(failed);
              }}
            >
              {t("install.retryInstallation")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCopyLogs}
            >
              <Copy size={13} />
              {copied ? t("install.copied") : t("install.copyLogs")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                window.omniworkerAPI.openExternal(TELEGRAM_COMMUNITY_URL)
              }
              title={TELEGRAM_COMMUNITY_URL}
            >
              <Send size={13} />
              Join Community
            </button>
          </div>
        </div>
      )}

      {!done && !failed && (
        <div className="install-step-info">
          <div className="install-step-title">
            {t("install.stepLabel", {
              step: progress.step,
              total: progress.totalSteps,
              title: progress.title,
            })}
          </div>
          <div className="install-step-detail">{progress.detail}</div>
        </div>
      )}

      <div className="install-log" ref={logRef}>
        {progress.log || t("install.waitingToStart")}
      </div>

      {done && (
        <div className="install-done">
          <button className="btn btn-primary" onClick={onComplete}>
            {t("install.continueToSetup")}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default Install;
