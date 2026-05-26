import React, { useEffect } from "react";

interface SplashScreenProps {
  onFinished: () => void;
}

function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  useEffect(() => {
    onFinished();
  }, [onFinished]);

  return (
    <div
      style={{
        backgroundColor: "var(--bg-primary)",
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="loading-spinner" />
    </div>
  );
}

export default SplashScreen;
