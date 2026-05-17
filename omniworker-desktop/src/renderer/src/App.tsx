import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Welcome from "./screens/Welcome/Welcome";
import Install from "./screens/Install/Install";
import Setup from "./screens/Setup/Setup";
import Layout from "./screens/Layout/Layout";
import SplashScreen from "./screens/SplashScreen/SplashScreen";
import Login from "./screens/Login/Login";

type Screen = "splash" | "login" | "welcome" | "installing" | "setup" | "main";

// Minimum time the splash stays visible so the brand animation plays
// through. Tracks the splash logo fade-in duration in main.css.
const SPLASH_MIN_MS = 1300;

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("splash");
  const [installError, setInstallError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<
    "local" | "remote" | "ssh"
  >("local");
  const [verifyWarning, setVerifyWarning] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const isMac = window.electron?.process?.platform === "darwin";

  const runInstallCheck = useCallback(async () => {
    const startedAt = Date.now();
    let next: Screen = "login"; // OMNIWORKER B2B: Siempre empezamos en Login

    // TODO: Comprobar JWT guardado localmente para auto-login

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    setScreen(next);
  }, []);

  useEffect(() => {
    runInstallCheck();
  }, [runInstallCheck]);

  const handleSplashFinished = useCallback(() => {
    /* splash transition is driven by the install check, not a timer */
  }, []);

  const runPostLoginInstallCheck = async () => {
    try {
      const mode = await window.omniworkerAPI.isRemoteOnlyMode();
      if (mode) {
        setScreen("main");
        return;
      }
      
      const installStatus = await window.omniworkerAPI.checkInstall();
      if (installStatus.installed) {
        setScreen("main");
      } else {
        setScreen("installing");
      }
    } catch (err) {
      console.error("Install check failed:", err);
      setScreen("installing");
    }
  };

  const handleLoginSuccess = async (user: any, auth: any) => {
    setUserData(user);
    
    if (auth?.accessToken) {
      setAuthToken(auth.accessToken);
      
      // OMNIWORKER B2B: Configure the LOCAL agent to use the SaaS backend as its LLM provider
      const saasUrl = import.meta.env.VITE_SAAS_URL || "https://worker.thelab.lat";
      const gatewayUrl = `${saasUrl}/api/v1`;
      
      // 1. Guardar el token como OPENAI_API_KEY para que el agente local lo detecte automáticamente
      await window.omniworkerAPI.setEnv("OPENAI_API_KEY", auth.accessToken);
      
      // 2. Configurar el provider 'custom' para que apunte al SaaS
      await window.omniworkerAPI.setModelConfig("custom", "omniworker", gatewayUrl);
      
      // 3. Forzar modo local (para que el Desktop App hable con el agente Python local)
      await window.omniworkerAPI.setConnectionConfig("local", "", "");
    }

    // Comprobar la instalación para descargar la DB, RAG y motor local si faltan
    await runPostLoginInstallCheck();
  };

  function handleInstallComplete(): void {
    setInstallError(null);
    // B2B: The API Key is already configured during handleLoginSuccess, so we skip manual setup
    setScreen("main");
  }

  function handleInstallFailed(error: string): void {
    setInstallError(error);
    setScreen("welcome");
  }

  function handleRetryInstall(): void {
    setInstallError(null);
    setScreen("installing");
  }

  function handleRecheck(): void {
    setInstallError(null);
    setScreen("splash");
    runInstallCheck();
  }

  async function handleSwitchToLocal(): Promise<void> {
    await window.omniworkerAPI.setConnectionConfig("local", "", "");
    setConnectionMode("local");
    handleRecheck();
  }

  function handleVerifyReinstall(): void {
    setVerifyWarning(false);
    setInstallError(null);
    setScreen("installing");
  }

  function handleDismissVerifyWarning(): void {
    setVerifyWarning(false);
  }

  function renderScreen(): React.JSX.Element {
    // BLOQUEO B2B
    if (userData?.isLocked) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-black text-white font-mono z-50 fixed top-0 left-0">
          <div className="border-8 border-white p-12 text-center max-w-lg">
            <h1 className="text-4xl font-bold uppercase mb-4 text-red-500">Acceso Bloqueado</h1>
            <p className="text-xl font-bold uppercase mb-8">
              Tu plan de suscripción B2B ha expirado o te has quedado sin tokens.
            </p>
            <p className="text-sm">Por favor, contacta a tu administrador para reactivar la cuenta.</p>
            <button 
              onClick={() => setUserData(null)} 
              className="mt-8 bg-white text-black px-6 py-2 font-bold uppercase hover:bg-gray-200"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      );
    }

    switch (screen) {
      case "splash":
        return <SplashScreen onFinished={handleSplashFinished} />;
      case "login":
        return <Login onLoginSuccess={handleLoginSuccess} />;
      case "welcome":
        return (
          <Welcome
            error={installError}
            connectionMode={connectionMode}
            onStart={handleRetryInstall}
            onRecheck={handleRecheck}
            onSwitchToLocal={handleSwitchToLocal}
          />
        );
      case "installing":
        return (
          <Install
            onComplete={handleInstallComplete}
            onFailed={handleInstallFailed}
            authToken={authToken}
          />
        );
      case "setup":
        return (
          <Setup
            onComplete={() => setScreen("main")}
            verifyWarning={verifyWarning}
            onReinstall={handleVerifyReinstall}
            onDismissVerifyWarning={handleDismissVerifyWarning}
          />
        );
      case "main":
        return (
          <Layout
            verifyWarning={verifyWarning}
            onReinstall={handleVerifyReinstall}
            onDismissVerifyWarning={handleDismissVerifyWarning}
            userData={userData}
            authToken={authToken}
          />
        );
    }
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <div className="app">
          {isMac && <div className="drag-region" />}
          <div className="app-content">{renderScreen()}</div>
        </div>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
