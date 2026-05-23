import { useState, useEffect, useCallback } from "react";
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
const SPLASH_MIN_MS = 2800;

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

  const handleLogout = useCallback(() => {
    console.error("[APP] Logging out user and clearing local storage...");
    setUserData(null);
    setAuthToken(null);
    localStorage.removeItem("ow_user");
    localStorage.removeItem("ow_auth");

    // Clear auto-refresh interval if active
    if ((window as any).__owRefreshInterval) {
      clearInterval((window as any).__owRefreshInterval);
      delete (window as any).__owRefreshInterval;
    }

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

    if (auth?.accessToken) {
      console.error("[APP] Got accessToken, setting auth token");
      setAuthToken(auth.accessToken);

      // Guardar en localStorage para auto-login
      localStorage.setItem("ow_user", JSON.stringify(user));
      localStorage.setItem("ow_auth", JSON.stringify(auth));

      const saasUrl =
        import.meta.env.VITE_SAAS_URL || "https://worker.thelab.lat";

      // 1. Guardar JWT para que los procesos Python/CLI también lo usen
      await window.omniworkerAPI.setEnv("OPENAI_API_KEY", auth.accessToken);
      await window.omniworkerAPI.setEnv("CUSTOM_API_KEY", auth.accessToken);
      await window.omniworkerAPI.setEnv("CLOUD_API_URL", `${saasUrl}/api`);

      // 2. Configurar conexión LOCAL para mantener la capacidad de ejecución local de herramientas
      await window.omniworkerAPI.setConnectionConfig(
        "local",
        "",
        "",
      );

      // 3. Configurar el backend custom del agente local para que consuma a través del Smart Router
      const routerUrl = `http://127.0.0.1:8341/v1`;
      await window.omniworkerAPI.setModelConfig(
        "custom",
        "omniworker",
        routerUrl,
      );

      console.error("[APP] Configured local mode with custom B2B SaaS backend");

      // 4. Iniciar Smart Router para enrutar mensajes simples al SLM local
      //    (no-fatal: si no está disponible el SLM, todo va al SaaS igual)
      try {
        await window.omniworkerAPI.startSmartRouter();
        console.error("[APP] Smart Router started");
      } catch (srErr: any) {
        console.error("[APP] Smart Router failed (non-fatal):", srErr?.message);
      }

      // 5. Auto-refresh del JWT cada 12 minutos para mantener la sesión viva
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
                // Guardar el nuevo token refrescado en localStorage
                const updatedAuth = {
                  accessToken: data.accessToken,
                  refreshToken: data.refreshToken || refreshToken,
                };
                localStorage.setItem("ow_auth", JSON.stringify(updatedAuth));

                // Actualizar token en config para que el próximo mensaje use el nuevo JWT
                await window.omniworkerAPI.setEnv(
                  "OPENAI_API_KEY",
                  data.accessToken,
                );
                await window.omniworkerAPI.setEnv(
                  "CUSTOM_API_KEY",
                  data.accessToken,
                );
                const routerUrl = `http://127.0.0.1:8341/v1`;
                await window.omniworkerAPI.setModelConfig(
                  "custom",
                  "omniworker",
                  routerUrl,
                );
                return data.refreshToken || refreshToken;
              }
            } else if (res.status === 401) {
              // Si el refresh token es inválido o expiró, cerrar sesión de inmediato
              console.error("[APP] Refresh token invalid or expired (401). Logging out...");
              handleLogout();
            }
          } catch (err) {
            console.error("[APP] Failed to refresh token:", err);
          }
          return refreshToken;
        };

        let currentRefreshToken = auth.refreshToken;

        // Limpiar intervalo previo existente para evitar fugas
        if ((window as any).__owRefreshInterval) {
          clearInterval((window as any).__owRefreshInterval);
        }

        // Ejecutar refresh de inmediato en startup/login para asegurar un token fresco y evitar 401s
        doRefresh(currentRefreshToken).then((newRefresh) => {
          currentRefreshToken = newRefresh;
        });

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
  }, [runPostLoginInstallCheck]);

  const runInstallCheck = useCallback(async () => {
    const startedAt = Date.now();
    let next: Screen = "login"; // OMNIWORKER B2B: Siempre empezamos en Login

    let autoLoggedIn = false;
    const savedUser = localStorage.getItem("ow_user");
    const savedAuth = localStorage.getItem("ow_auth");

    if (savedUser && savedAuth) {
      try {
        const user = JSON.parse(savedUser);
        const auth = JSON.parse(savedAuth);
        if (auth?.accessToken) {
          console.error("[APP] Found saved credentials, auto-logging in user:", user.email);
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
  }, [handleLoginSuccess]);

  useEffect(() => {
    runInstallCheck();
  }, [runInstallCheck]);

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
