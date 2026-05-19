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
      console.error(`[APP] mode: ${mode}`);
      if (mode) {
        setScreen("main");
        return;
      }

      const installStatus = await window.omniworkerAPI.checkInstall();
      console.error(`[APP] installStatus:`, installStatus);
      let isVerified = false;
      if (installStatus.installed) {
        isVerified = await window.omniworkerAPI.verifyInstall();
      }
      console.error(`[APP] isVerified:`, isVerified);

      if (installStatus.installed && isVerified) {
        setScreen("main");
        console.error(`[APP] Screen set to main`);
      } else {
        setScreen("installing");
        console.error(`[APP] Screen set to installing`);
      }
    } catch (err) {
      console.error("Install check failed:", err);
      setScreen("installing");
      console.error(`[APP] Screen set to installing (catch)`);
    }
  };

  const handleLoginSuccess = async (user: any, auth: any) => {
    console.error("[APP] handleLoginSuccess started");
    setUserData(user);

    if (auth?.accessToken) {
      console.error("[APP] Got accessToken, setting auth token");
      setAuthToken(auth.accessToken);

      const saasUrl =
        import.meta.env.VITE_SAAS_URL || "https://worker.thelab.lat";

      // 1. Guardar JWT para que los procesos Python/CLI también lo usen
      await window.omniworkerAPI.setEnv("OPENAI_API_KEY", auth.accessToken);
      await window.omniworkerAPI.setEnv("CLOUD_API_URL", `${saasUrl}/api`);

      // 2. Configurar conexión LOCAL para usar el gateway Python y sus herramientas
      await window.omniworkerAPI.setConnectionConfig(
        "local",
        `${saasUrl}/api`,
        auth.accessToken,
      );
      console.error("[APP] Connection set to local mode");

      // 3. Iniciar Smart Router para enrutar mensajes simples al SLM local
      //    (no-fatal: si no está disponible el SLM, todo va al SaaS igual)
      try {
        await window.omniworkerAPI.startGateway();
        console.error("[APP] Gateway started");
        await window.omniworkerAPI.startSmartRouter();
        console.error("[APP] Smart Router started");
      } catch (srErr: any) {
        console.error("[APP] Backend startup failed (non-fatal):", srErr?.message);
      }

      // 4. Auto-refresh del JWT cada 12 minutos para mantener la sesión viva
      if (auth.refreshToken) {
        const doRefresh = async (refreshToken: string) => {
          try {
            const res = await fetch(`${saasUrl}/api/v1/auth/refresh`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refreshToken }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.accessToken) {
                setAuthToken(data.accessToken);
                // Actualizar token en config para que el próximo mensaje use el nuevo JWT
                await window.omniworkerAPI.setEnv(
                  "OPENAI_API_KEY",
                  data.accessToken,
                );
                await window.omniworkerAPI.setConnectionConfig(
                  "local",
                  `${saasUrl}/api`,
                  data.accessToken,
                );
                return data.refreshToken || refreshToken;
              }
            }
          } catch {
            /* silent — will retry next cycle */
          }
          return refreshToken;
        };

        let currentRefreshToken = auth.refreshToken;
        const interval = setInterval(
          async () => {
            currentRefreshToken = await doRefresh(currentRefreshToken);
          },
          12 * 60 * 1000,
        );

        (window as any).__owRefreshInterval = interval;
      }
    }

    console.error("[APP] Running post login install check...");
    await runPostLoginInstallCheck();
    console.error("[APP] handleLoginSuccess finished");
  };

  async function handleInstallComplete(): Promise<void> {
    setInstallError(null);
    // B2B: The API Key is already configured during handleLoginSuccess, so we skip manual setup
    
    try {
      await window.omniworkerAPI.startSmartRouter();
      await window.omniworkerAPI.startGateway();
    } catch (err) {
      console.error("Failed to start backend services after install:", err);
    }
    
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
            <h1 className="text-4xl font-bold uppercase mb-4 text-red-500">
              Acceso Bloqueado
            </h1>
            <p className="text-xl font-bold uppercase mb-8">
              Tu plan de suscripción B2B ha expirado o te has quedado sin
              tokens.
            </p>
            <p className="text-sm">
              Por favor, contacta a tu administrador para reactivar la cuenta.
            </p>
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
