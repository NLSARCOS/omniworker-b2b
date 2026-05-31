import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Welcome from "./screens/Welcome/Welcome";
import Onboarding from "./screens/Onboarding/Onboarding";
import Install from "./screens/Install/Install";
import Setup from "./screens/Setup/Setup";
import Layout from "./screens/Layout/Layout";
import SplashScreen from "./screens/SplashScreen/SplashScreen";
import Login from "./screens/Login/Login";

type Screen = "splash" | "login" | "welcome" | "installing" | "setup" | "main" | "onboarding";

// Minimum time the splash stays visible so the brand animation plays
// through. Tracks the splash logo fade-in duration in main.css.
const SPLASH_MIN_MS = 0;

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("splash");
  const installCheckStarted = useRef(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<
    "local" | "remote" | "ssh"
  >("local");
  const [verifyWarning, setVerifyWarning] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const isMac = window.electron?.process?.platform === "darwin";

  const handleLogout = useCallback(() => {
    console.error("[APP] Logging out user and clearing local storage...");
    setUserData(null);
    setAuthToken(null);
    localStorage.removeItem("ow_user");
    localStorage.removeItem("ow_auth");
    window.omniworkerAPI.deleteTokens().catch(console.error);

    // Signal main process to stop the token refresh loop
    window.omniworkerAPI.stopTokenRefreshLoop();

    setScreen("login");
  }, []);

  const runPostLoginInstallCheck = useCallback(async () => {
    try {
      const mode = await window.omniworkerAPI.isRemoteOnlyMode();
      if (mode) {
        const completed = await window.omniworkerAPI.getOnboardingStatus();
        if (completed) {
          setScreen("main");
        } else {
          setScreen("onboarding");
        }
        return;
      }

      const installStatus = await window.omniworkerAPI.checkInstall();
      let isVerified = false;
      if (installStatus.installed) {
        isVerified = await window.omniworkerAPI.verifyInstall();
      }

      if (installStatus.installed && isVerified) {
        const completed = await window.omniworkerAPI.getOnboardingStatus();
        if (completed) {
          setScreen("main");
        } else {
          setScreen("onboarding");
        }
      } else {
        setScreen("installing");
      }
    } catch (err) {
      console.error("Install check failed:", err);
      setScreen("installing");
    }
  }, []);

  const handleLoginSuccess = useCallback(async (user: any, auth: any) => {
    console.error("[APP] handleLoginSuccess started");
    setUserData(user);

    // Sync B2B subscription plan state to Main process
    const isExpired = !!user?.isPlanExpired;
    try {
      await window.omniworkerAPI.setPlanExpired(isExpired);
      console.error(`[APP] Enforced plan expiration in main process: ${isExpired}`);
    } catch (err: any) {
      console.error("[APP] Failed to sync plan expiration to main process:", err?.message);
    }

    if (auth?.accessToken) {
      console.error("[APP] Got accessToken, setting auth token");
      setAuthToken(auth.accessToken);

      // Guardar en localStorage (solo datos de usuario no sensibles) y en safeStorage para tokens
      localStorage.setItem("ow_user", JSON.stringify(user));
      localStorage.removeItem("ow_auth"); // Ensure old plain text token is removed
      await window.omniworkerAPI.saveTokens({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      });

      const saasUrl =
        import.meta.env.VITE_SAAS_URL || "https://flux.simplex.lat";

      // 1. Guardar CLOUD_API_URL y tokens en env para posibilitar el ruteo del agente y smart router
      await window.omniworkerAPI.setEnv("OPENAI_API_KEY", auth.accessToken);
      await window.omniworkerAPI.setEnv("CUSTOM_API_KEY", auth.accessToken);
      await window.omniworkerAPI.setEnv("CLOUD_API_URL", `${saasUrl}/api`);

      // 2. Configurar conexión LOCAL para mantener la capacidad de ejecución local de herramientas
      await window.omniworkerAPI.setConnectionConfig(
        "local",
        "",
        "",
      );

      // 3. Configurar el backend custom del agente para conectar DIRECTO al SaaS
      const directSaasApi = `${saasUrl}/api/v1`;
      await window.omniworkerAPI.setModelConfig(
        "custom",
        "omniworker",
        directSaasApi,
        undefined,
        auth.accessToken,
      );

      console.error("[APP] Configured direct SaaS connection:", directSaasApi);

      // 4. Signal main process to start the token refresh loop.
      //    The main process handles refreshing regardless of renderer state
      //    (window closed on macOS, app minimized, renderer throttled).
      window.omniworkerAPI.startTokenRefreshLoop();
    }

    console.error("[APP] Running post login install check...");
    await runPostLoginInstallCheck();
    console.error("[APP] handleLoginSuccess finished");
  }, [runPostLoginInstallCheck]);

  const runInstallCheck = useCallback(async () => {
    const startedAt = Date.now();
    let next: Screen = "login"; // FLUX AGENT B2B: Siempre empezamos en Login

    let autoLoggedIn = false;
    const savedUser = localStorage.getItem("ow_user");
    const savedAuth = localStorage.getItem("ow_auth");

    // ── MIGRATION ON FIRST LAUNCH ──
    let secureTokens = await window.omniworkerAPI.getTokens();
    if (savedAuth && (!secureTokens.accessToken || !secureTokens.refreshToken)) {
      console.error("[APP] Migrating existing plaintext tokens from localStorage to safeStorage...");
      try {
        const auth = JSON.parse(savedAuth);
        if (auth?.accessToken && auth?.refreshToken) {
          await window.omniworkerAPI.saveTokens({
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken,
          });
          // Retrieve newly migrated tokens
          secureTokens = await window.omniworkerAPI.getTokens();
        }
      } catch (err) {
        console.error("[APP] Failed to migrate existing localStorage tokens:", err);
      }
      // Delete old plain text storage and sync keys to env
      localStorage.removeItem("ow_auth");
      if (secureTokens.accessToken) {
        await window.omniworkerAPI.setEnv("OPENAI_API_KEY", secureTokens.accessToken);
        await window.omniworkerAPI.setEnv("CUSTOM_API_KEY", secureTokens.accessToken);
      }
    }

    const auth = (secureTokens.accessToken && secureTokens.refreshToken) ? secureTokens : null;

    if (savedUser && auth) {
      try {
        const user = JSON.parse(savedUser);
        if (auth?.accessToken) {
          console.error("[APP] Found saved credentials, auto-logging in user:", user.email);
          // The main process already fires an immediate token refresh on startup
          // when it finds existing tokens in safeStorage, so we skip the renderer-side
          // refresh here to avoid duplicate concurrent refreshes (jti collision).
          await handleLoginSuccess(user, auth);
          autoLoggedIn = true;
        }
      } catch (err) {
        console.error("[APP] Error parsing saved login session:", err);
      }
    }

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }

    if (!autoLoggedIn) {
      setScreen(next);
    }
  }, [handleLoginSuccess, handleLogout]);

  useEffect(() => {
    if (installCheckStarted.current) return;
    installCheckStarted.current = true;
    runInstallCheck();
  }, [runInstallCheck]);

  // Listen for main-process token refresh events
  useEffect(() => {
    const unsubRefresh = window.omniworkerAPI.onTokenRefreshed((data) => {
      console.error("[APP] Received token-refreshed from main process");
      setAuthToken(data.accessToken);
      if (data.user) {
        setUserData(data.user);
        localStorage.setItem("ow_user", JSON.stringify(data.user));
      }
    });
    const unsubExpired = window.omniworkerAPI.onSessionExpired(() => {
      console.error("[APP] Received session-expired from main process");
      handleLogout();
    });
    return () => {
      unsubRefresh();
      unsubExpired();
    };
  }, [handleLogout]);

  const handleSplashFinished = useCallback(() => {
    /* splash transition is driven by the install check, not a timer */
  }, []);

  async function handleInstallComplete(): Promise<void> {
    setInstallError(null);
    // B2B: The API Key is already configured during handleLoginSuccess, so we skip manual setup
    
    try {
      await window.omniworkerAPI.startSmartRouter();
      await window.omniworkerAPI.startGateway();
    } catch (err) {
      console.error("Failed to start backend services after install:", err);
    }
    
    const completed = await window.omniworkerAPI.getOnboardingStatus();
    if (completed) {
      setScreen("main");
    } else {
      setScreen("onboarding");
    }
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
    // BLOQUEO B2B (Desactivado en DEV para permitir capturas de pantalla de la documentación)
    if (userData?.isLocked && !userData?.isPlanExpired && !import.meta.env.DEV) {
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
              onClick={handleLogout}
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
            onLogout={handleLogout}
          />
        );
      case "onboarding":
        return <Onboarding onComplete={() => setScreen("main")} />;
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
