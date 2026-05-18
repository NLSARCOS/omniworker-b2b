import { useEffect } from "react";

interface SplashScreenProps {
  onFinished: () => void;
}
function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  useEffect(() => {
    onFinished();
  }, [onFinished]);

  return (
    <div
      className="splash-screen"
      style={{
        backgroundColor: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: "48px",
          fontWeight: "900",
          letterSpacing: "4px",
          fontFamily: "var(--font-mono)",
          border: "4px solid #fff",
          padding: "10px 20px",
        }}
      >
        OMNIWORKER
      </div>
      <div
        style={{
          color: "#666",
          marginTop: "20px",
          fontSize: "14px",
          fontFamily: "var(--font-mono)",
          letterSpacing: "2px",
        }}
      >
        AGENT-AS-A-SERVICE
      </div>
    </div>
  );
}

export default SplashScreen;
