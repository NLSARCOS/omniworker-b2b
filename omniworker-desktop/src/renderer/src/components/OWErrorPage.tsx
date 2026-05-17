interface OWErrorPageProps {
  title?: string;
  message: string;
  code?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function OWErrorPage({
  title = "Connection Error",
  message,
  code,
  onRetry,
  onDismiss,
}: OWErrorPageProps) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(9, 9, 11, 0.92)",
      backdropFilter: "blur(12px)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
    }}>
      <div style={{
        maxWidth: 480,
        width: "90%",
        padding: "40px 32px",
        borderRadius: 20,
        background: "linear-gradient(145deg, #18181b 0%, #0f0f12 100%)",
        border: "1px solid rgba(249, 115, 22, 0.15)",
        boxShadow: "0 0 60px rgba(249, 115, 22, 0.08), 0 20px 40px rgba(0,0,0,0.4)",
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 64,
          height: 64,
          margin: "0 auto 20px",
          borderRadius: "50%",
          background: "rgba(239, 68, 68, 0.1)",
          border: "2px solid rgba(239, 68, 68, 0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
        }}>
          ⚡
        </div>

        {/* Title */}
        <h2 style={{
          margin: "0 0 8px",
          fontSize: 20,
          fontWeight: 700,
          color: "#fafafa",
          letterSpacing: "-0.3px",
        }}>
          {title}
        </h2>

        {/* Error Code Badge */}
        {code && (
          <div style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: 6,
            background: "rgba(249, 115, 22, 0.1)",
            border: "1px solid rgba(249, 115, 22, 0.2)",
            fontSize: 11,
            fontWeight: 600,
            color: "#f97316",
            marginBottom: 16,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>
            {code}
          </div>
        )}

        {/* Message */}
        <p style={{
          margin: "0 0 28px",
          fontSize: 14,
          lineHeight: 1.6,
          color: "#a1a1aa",
        }}>
          {message}
        </p>

        {/* Diagnostic Info */}
        <div style={{
          padding: "12px 16px",
          borderRadius: 10,
          background: "rgba(39, 39, 42, 0.5)",
          border: "1px solid rgba(63, 63, 70, 0.5)",
          marginBottom: 24,
          textAlign: "left",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Diagnóstico
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <DiagnosticLine label="Cloud SaaS" />
            <DiagnosticLine label="Gateway Local" />
            <DiagnosticLine label="SLM Local" />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                background: "#f97316",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Reintentar
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "1px solid #3f3f46",
                background: "transparent",
                color: "#a1a1aa",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DiagnosticLine({ label }: { label: string }) {
  // In a real app, these would be dynamic. For now, show the status indicators.
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: "#ef4444",
        boxShadow: "0 0 6px rgba(239, 68, 68, 0.5)",
      }} />
      <span style={{ fontSize: 13, color: "#a1a1aa" }}>{label}</span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#52525b", fontFamily: "monospace" }}>—</span>
    </div>
  );
}
