# Plan de Fix: Bloqueo de Desktop al Pausar Suscripción

**Fecha:** 2026-05-19
**Estado:** Pendiente de aprobación
**Severidad:** Alta — experiencia de usuario rota cuando admin pausa suscripción

---

## Problema

Cuando un administrador pausa una suscripción (`tenant.isActive = false`) en el SaaS,
el desktop del usuario NO muestra una pantalla de bloqueo clara. Esto ocurre porque
`isLocked` solo evalúa `tokenBalance <= 0` y no considera el estado del tenant.

### Escenarios afectados

| Escenario | `tenant.isActive` | `tokenBalance` | `isLocked` actual | Debería ser |
|---|---|---|---|---|
| Admin pausa suscripción, usuario tiene tokens | `false` | 5000 | `false` | `true` |
| Admin pausa suscripción, usuario sin tokens | `false` | 0 | `true` | `true` |
| Admin pausa plan (`plan.isActive = false`) | `true` | 5000 | `false` | `true` |
| Licencia revocada (`license.status != "ACTIVE"`) | `true` | 5000 | `false` | `true` |

### Archivos involucrados

```
omniworker-saas/src/lib/auth.ts                              ← calcular isLocked correctamente
omniworker-saas/src/app/api/v1/auth/login/route.ts           ← login devuelve isLocked
omniworker-saas/src/app/api/v1/auth/me/route.ts              ← /me devuelve isLocked
omniworker-saas/src/app/api/v1/auth/refresh/route.ts         ← refresh devuelve isLocked
omniworker-saas/src/app/api/admin/tenants/route.ts           ← admin pausa suscripción
omniworker-desktop/src/renderer/src/App.tsx                  ← pantalla de bloqueo
omniworker-desktop/src/renderer/src/screens/Account/Account.tsx ← mostrar razón del bloqueo
omniworker-desktop/src/renderer/src/screens/Layout/Layout.tsx ← polling de estado
omniworker-desktop/src/main/omniworker.ts                    ← IPC bridge estado SaaS
```

---

## Cambio 1: `isLocked` debe considerar el estado del tenant y la licencia

### Archivo: `omniworker-saas/src/lib/auth.ts`

**Problema actual (líneas 274, 323, 455):**
```typescript
isLocked: user.tokenBalance <= 0,
```

**Nuevo cálculo — crear una función helper:**

```typescript
/**
 * Calcula si el usuario debe ser bloqueado en el desktop.
 * Un usuario está bloqueado si CUALQUIERA de estas condiciones es true:
 *   1. Su tenant está desactivado (isActive = false)
 *   2. Su plan está desactivado (plan.isActive = false)
 *   3. Su licencia no está activa (status !== "ACTIVE")
 *   4. Su balance de tokens es <= 0
 *   5. Su suscripción expiró (subscriptionEndsAt < ahora)
 */
function calculateLockStatus(params: {
  tenantIsActive: boolean;
  planIsActive: boolean | null | undefined;
  licenseStatus: string | null | undefined;
  tokenBalance: number;
  subscriptionEndsAt: Date | null;
}): { isLocked: boolean; lockReason: string | null } {

  if (!params.tenantIsActive) {
    return { isLocked: true, lockReason: "SUBSCRIPTION_PAUSED" };
  }

  if (params.planIsActive === false) {
    return { isLocked: true, lockReason: "PLAN_DEACTIVATED" };
  }

  if (params.licenseStatus && params.licenseStatus !== "ACTIVE") {
    return { isLocked: true, lockReason: "LICENSE_REVOKED" };
  }

  if (params.subscriptionEndsAt && new Date(params.subscriptionEndsAt) < new Date()) {
    return { isLocked: true, lockReason: "SUBSCRIPTION_EXPIRED" };
  }

  if (params.tokenBalance <= 0) {
    return { isLocked: true, lockReason: "NO_TOKENS" };
  }

  return { isLocked: false, lockReason: null };
}
```

**Actualizar la interfaz `AuthResult` (línea ~43):**
```typescript
interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string | null;
  tokenBalance: number;
  plan: string | null;
  isLocked: boolean;
  lockReason: string | null;    // ← NUEVO
}

interface AuthResult {
  success: boolean;
  error?: string;
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
}
```

**Actualizar TODOS los lugares donde se calcula `isLocked`:**

1. **Línea ~274** (`validateJWT`):
```typescript
// ANTES:
isLocked: dbUser.tokenBalance <= 0,

// DESPUÉS:
...calculateLockStatus({
  tenantIsActive: dbUser.tenant?.isActive ?? false,
  planIsActive: dbUser.tenant?.plan?.isActive,
  licenseStatus: "ACTIVE",  // ya validado arriba en authenticateRequest
  tokenBalance: dbUser.tokenBalance,
  subscriptionEndsAt: dbUser.tenant?.subscriptionEndsAt ?? null,
}),
```

2. **Línea ~323** (`loginWithEmail`):
```typescript
// ANTES:
isLocked: user.tokenBalance <= 0,

// DESPUÉS:
...calculateLockStatus({
  tenantIsActive: user.tenant?.isActive ?? false,
  planIsActive: user.tenant?.plan?.isActive,
  licenseStatus: "ACTIVE",  // login solo funciona si licencia activa
  tokenBalance: user.tokenBalance,
  subscriptionEndsAt: user.tenant?.subscriptionEndsAt ?? null,
}),
```

3. **Línea ~455** (`refreshAccessToken`):
```typescript
// ANTES:
isLocked: user.tokenBalance <= 0,

// DESPUÉS — necesita include de tenant con plan:
const user = await prisma.user.findUnique({
  where: { id: payload.userId },
  include: {
    tenant: {
      include: { plan: true }    // ← NUEVO: necesita plan.isActive
    }
  },
});

...calculateLockStatus({
  tenantIsActive: user.tenant?.isActive ?? false,
  planIsActive: user.tenant?.plan?.isActive,
  licenseStatus: "ACTIVE",
  tokenBalance: user.tokenBalance,
  subscriptionEndsAt: user.tenant?.subscriptionEndsAt ?? null,
}),
```

**NOTA IMPORTANTE sobre `refreshAccessToken`:** Actualmente la query de Prisma
en refresh NO hace include de `tenant.plan`. Hay que agregar ese include para
tener acceso a `plan.isActive` y `tenant.subscriptionEndsAt`. Verificar la query
actual y agregar:

```typescript
include: {
  tenant: {
    include: { plan: true }
  }
}
```

---

## Cambio 2: Login debe rechazar usuarios de tenant inactivo

### Archivo: `omniworker-saas/src/lib/auth.ts` — función `loginWithEmail`

**Problema actual (línea ~287):**
```typescript
if (!user || !user.isActive) {
  return { success: false, error: "Credenciales inválidas" };
}
```

Esto NO verifica si el tenant está activo. Un usuario con `isActive = true`
pero `tenant.isActive = false` puede hacer login y recibir tokens JWT.

**Fix — agregar validación de tenant:**
```typescript
if (!user || !user.isActive) {
  return { success: false, error: "Credenciales inválidas" };
}

// Verificar que el tenant esté activo
if (!user.tenant?.isActive) {
  return {
    success: false,
    error: "Tu suscripción ha sido pausada. Contacta a tu administrador.",
  };
}

// Verificar que el plan esté activo
if (user.tenant.plan?.isActive === false) {
  return {
    success: false,
    error: "Tu plan ha sido desactivado. Contacta a tu administrador.",
  };
}

// Verificar que la suscripción no haya expirado
if (user.tenant.subscriptionEndsAt &&
    new Date(user.tenant.subscriptionEndsAt) < new Date()) {
  return {
    success: false,
    error: "Tu suscripción ha expirado. Contacta a tu administrador para renovar.",
  };
}
```

**NOTA:** La query actual de login ya hace `include: { tenant: { include: { plan: true } } }`
así que tenemos acceso a `user.tenant.isActive`, `user.tenant.plan.isActive`, y
`user.tenant.subscriptionEndsAt`.

---

## Cambio 3: Desktop muestra razón específica del bloqueo

### Archivo: `omniworker-desktop/src/renderer/src/App.tsx`

**Problema actual (líneas 219-242):** Mensaje genérico sin razón específica.

**Fix — mensajes específicos por `lockReason`:**

```typescript
function getLockMessage(reason: string | null): {
  title: string;
  description: string;
  action: string;
} {
  switch (reason) {
    case "SUBSCRIPTION_PAUSED":
      return {
        title: "Suscripción Pausada",
        description: "Tu administrador ha pausado la suscripción de tu organización.",
        action: "Contacta a tu administrador para reactivar la suscripción.",
      };
    case "PLAN_DEACTIVATED":
      return {
        title: "Plan Desactivado",
        description: "El plan asociado a tu cuenta ha sido desactivado.",
        action: "Contacta a tu administrador o soporte técnico.",
      };
    case "LICENSE_REVOKED":
      return {
        title: "Licencia Revocada",
        description: "Tu licencia de acceso ha sido revocada.",
        action: "Contacta a tu administrador para obtener una nueva licencia.",
      };
    case "SUBSCRIPTION_EXPIRED":
      return {
        title: "Suscripción Expirada",
        description: "El período de tu suscripción ha llegado a su fin.",
        action: "Contacta a tu administrador para renovar la suscripción.",
      };
    case "NO_TOKENS":
      return {
        title: "Sin Tokens",
        description: "Te has quedado sin tokens de uso.",
        action: "Contacta a tu administrador para recargar tokens.",
      };
    default:
      return {
        title: "Acceso Bloqueado",
        description: "Tu plan de suscripción B2B ha expirado o te has quedado sin tokens.",
        action: "Por favor, contacta a tu administrador para reactivar la cuenta.",
      };
  }
}
```

**Actualizar el JSX del bloqueo (reemplazar líneas 219-242):**

```typescript
function renderScreen(): React.JSX.Element {
  if (userData?.isLocked) {
    const lockInfo = getLockMessage(userData.lockReason ?? null);
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white font-mono z-50 fixed top-0 left-0">
        <div className="border-8 border-white p-12 text-center max-w-lg">
          <h1 className="text-4xl font-bold uppercase mb-4 text-red-500">
            {lockInfo.title}
          </h1>
          <p className="text-xl font-bold uppercase mb-8">
            {lockInfo.description}
          </p>
          <p className="text-sm">
            {lockInfo.action}
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
  // ... resto de screens
}
```

**Actualizar la interfaz userData en App.tsx:**

Agregar `lockReason` al tipo de `userData`:
```typescript
interface UserData {
  // ... campos existentes
  isLocked: boolean;
  lockReason: string | null;   // ← NUEVO
}
```

**Propagar `lockReason` desde Login hacia App.tsx:**
El componente Login recibe la respuesta del backend en `handleLoginSuccess`.
Verificar que el handler en App.tsx que recibe los datos del login también
capture `lockReason` y lo guarde en el estado `userData`.

---

## Cambio 4: Account screen muestra estado de suscripción

### Archivo: `omniworker-desktop/src/renderer/src/screens/Account/Account.tsx`

**Agregar `lockReason` a la interfaz (línea ~12-14):**
```typescript
interface AccountUserData {
  // ... campos existentes
  tokenBalance: number;
  isLocked: boolean;
  lockReason: string | null;   // ← NUEVO
}
```

**Agregar sección de estado de suscripción debajo del balance de tokens:**

Después del bloque que muestra `displayUser.isLocked` (línea ~271), agregar:

```tsx
{displayUser.isLocked && displayUser.lockReason && (
  <div style={{
    padding: "12px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "8px",
    marginTop: "12px",
  }}>
    <p style={{ color: "#ef4444", fontWeight: "bold", fontSize: "14px" }}>
      Estado: {getLockMessage(displayUser.lockReason).title}
    </p>
    <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
      {getLockMessage(displayUser.lockReason).action}
    </p>
  </div>
)}
```

---

## Cambio 5: Polling proactivo de estado de suscripción

### Archivo: `omniworker-desktop/src/renderer/src/screens/Layout/Layout.tsx`

**Problema:** El desktop solo se entera del bloqueo cuando el token se refresca
(cada ~12 min). Si el admin pausa la suscripción, el usuario puede seguir usando
la app por hasta 12 minutos.

**Fix — agregar polling cada 60 segundos:**

```typescript
// Dentro del componente Layout, agregar useEffect para polling:
useEffect(() => {
  if (!accessToken) return;

  const pollSubscriptionStatus = async () => {
    try {
      const resp = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        // Token inválido = sesión expirada o bloqueada
        setUserData(null);
        return;
      }
      const data = await resp.json();
      if (data.user?.isLocked) {
        // Actualizar userData con el nuevo estado de bloqueo
        setUserData((prev: any) => ({
          ...prev,
          isLocked: true,
          lockReason: data.user.lockReason ?? null,
        }));
      }
    } catch {
      // Silencioso — no interrumpir al usuario por errores de red
    }
  };

  const interval = setInterval(pollSubscriptionStatus, 60_000);
  return () => clearInterval(interval);
}, [accessToken]);
```

**NOTA:** Esto supone que el renderer tiene acceso al `accessToken` y una función
`setUserData`. Verificar cómo se pasa el estado entre componentes y ajustar
según la arquitectura actual del state management del desktop.

**Alternativa más robusta — IPC desde main process:**

Si el renderer no tiene acceso directo a fetch con el token, mover el polling
al main process de Electron:

### Archivo: `omniworker-desktop/src/main/omniworker.ts`

```typescript
// Iniciar polling de estado de suscripción después del login
function startSubscriptionPolling(accessToken: string): void {
  // Limpiar intervalo previo si existe
  if (subscriptionPollInterval) {
    clearInterval(subscriptionPollInterval);
  }

  subscriptionPollInterval = setInterval(async () => {
    try {
      const resp = await fetch("https://worker.thelab.lat/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!resp.ok) {
        // Token inválido o suscripción bloqueada
        mainWindow?.webContents.send("subscription:locked", {
          isLocked: true,
          lockReason: "SESSION_INVALID",
        });
        clearInterval(subscriptionPollInterval);
        return;
      }

      const data = await resp.json();
      if (data.user?.isLocked) {
        mainWindow?.webContents.send("subscription:locked", {
          isLocked: true,
          lockReason: data.user.lockReason ?? null,
        });
        clearInterval(subscriptionPollInterval);
      }
    } catch {
      // Silencioso
    }
  }, 60_000); // cada 60 segundos
}
```

**En el renderer, escuchar el evento IPC:**

```typescript
// En App.tsx o Layout.tsx:
useEffect(() => {
  window.electronAPI?.onSubscriptionLocked((data: { isLocked: boolean; lockReason: string | null }) => {
    if (data.isLocked) {
      setUserData((prev: any) => ({
        ...prev,
        isLocked: true,
        lockReason: data.lockReason,
      }));
    }
  });
}, []);
```

**En preload:**
```typescript
// Agregar al bridge:
onSubscriptionLocked: (callback: (data: any) => void) => {
  ipcRenderer.on("subscription:locked", (_event, data) => callback(data));
},
```

---

## Cambio 6: Admin feedback al pausar suscripción

### Archivo: `omniworker-saas/src/app/api/admin/tenants/route.ts`

**Mejora:** Cuando el admin pausa un tenant, registrar en audit log con contexto.

**En el PATCH handler (después de línea 176):**

```typescript
// Si se está desactivando el tenant, crear un registro de auditoría claro
if (updatePayload.isActive === false) {
  await prisma.adminAuditLog.create({
    data: {
      adminId: auth.user.id,
      action: "PAUSE_SUBSCRIPTION",
      target: id,
      metadata: JSON.stringify({
        tenantName: tenant.name,
        reason: "Admin paused subscription via dashboard",
      }),
    },
  });
}

// Si se está reactivando
if (updatePayload.isActive === true) {
  await prisma.adminAuditLog.create({
    data: {
      adminId: auth.user.id,
      action: "RESUME_SUBSCRIPTION",
      target: id,
      metadata: JSON.stringify({
        tenantName: tenant.name,
        reason: "Admin resumed subscription via dashboard",
      }),
    },
  });
}
```

---

## Cambio 7: validateJWT debe incluir tenant con plan

### Archivo: `omniworker-saas/src/lib/auth.ts` — función `validateJWT`

**Verificar que la query de Prisma incluya `tenant.plan` y `tenant.subscriptionEndsAt`.**

Buscar la query que carga el usuario en `validateJWT` y asegurar que sea:

```typescript
const dbUser = await prisma.user.findUnique({
  where: { id: payload.userId },
  include: {
    tenant: {
      include: { plan: true }    // ← necesario para plan.isActive
    }
  },
});
```

Si ya lo incluye, perfecto. Si no, agregar el include.

---

## Cambio 8: Guardar lockReason en el flujo de login del desktop

### Archivo: `omniworker-desktop/src/renderer/src/screens/Login/Login.tsx`

**Verificar que el handler de login exitoso propague `lockReason`:**

La respuesta del backend ahora incluye `lockReason`. El componente Login debe
pasar este campo al parent (App.tsx) a través del callback `onLoginSuccess`.

```typescript
// En Login.tsx, donde se procesa la respuesta del login:
const onLoginSuccess = (data: LoginResponse) => {
  // data.user ahora tiene lockReason
  onLoginSuccess({
    ...data.user,
    isLocked: data.user.isLocked,
    lockReason: data.user.lockReason ?? null,   // ← asegurarse de propagar
  });
};
```

**En App.tsx, donde se recibe el callback:**
```typescript
const handleLoginSuccess = (userData: UserData) => {
  setUserData({
    ...userData,
    isLocked: userData.isLocked,
    lockReason: userData.lockReason ?? null,
  });
  if (!userData.isLocked) {
    setScreen("main");
  }
  // Si isLocked, renderScreen() mostrará la pantalla de bloqueo automáticamente
};
```

---

## Orden de implementación

```
Paso 1 → Cambio 1: Helper calculateLockStatus + actualizar auth.ts
Paso 2 → Cambio 7: Verificar includes en validateJWT y refreshAccessToken
Paso 3 → Cambio 2: Login rechaza tenant inactivo con mensaje claro
Paso 4 → Cambio 8: Propagar lockReason en Login.tsx → App.tsx
Paso 5 → Cambio 3: Pantalla de bloqueo con mensajes específicos en App.tsx
Paso 6 → Cambio 4: Account screen muestra razón del bloqueo
Paso 7 → Cambio 5: Polling de estado de suscripción
Paso 8 → Cambio 6: Admin audit log al pausar/reanudar
```

---

## Testing

### Tests manuales requeridos

1. **Admin pausa tenant con usuario logueado:**
   - Login con usuario activo → desktop funciona
   - Admin pone `isActive = false`
   - Desktop debe mostrar bloqueo en <= 60 segundos (con polling)
   - Mensaje debe decir "Suscripción Pausada"

2. **Admin pausa tenant, usuario NO logueado:**
   - Admin pone `isActive = false`
   - Usuario intenta login → debe recibir error claro
   - Mensaje: "Tu suscripción ha sido pausada"

3. **Suscripción expira por fecha:**
   - Admin pone `subscriptionEndsAt` en el pasado
   - Desktop debe mostrar "Suscripción Expirada"

4. **Admin revoca licencia:**
   - Admin cambia `license.status` a "REVOKED"
   - Desktop debe mostrar "Licencia Revocada"

5. **Usuario sin tokens:**
   - Usuario agota `tokenBalance`
   - Desktop debe mostrar "Sin Tokens"

6. **Admin reactiva suscripción:**
   - Admin pone `isActive = true` + recarga tokens
   - Usuario hace login → debe poder entrar normalmente
   - Si estaba bloqueado, polling debe desbloquear (o require re-login)

### Tests automatizados sugeridos

```
omniworker-saas/__tests__/auth/calculateLockStatus.test.ts
  - tenant inactiva → isLocked true, reason SUBSCRIPTION_PAUSED
  - plan inactivo → isLocked true, reason PLAN_DEACTIVATED
  - licencia revocada → isLocked true, reason LICENSE_REVOKED
  - suscripción expirada → isLocked true, reason SUBSCRIPTION_EXPIRED
  - sin tokens → isLocked true, reason NO_TOKENS
  - todo activo con tokens → isLocked false, reason null
  - prioridad: tenant inactiva > sin tokens (tenant gana)

omniworker-saas/__tests__/auth/loginWithEmail.test.ts
  - login con tenant inactiva → error "suscripción pausada"
  - login con plan inactivo → error "plan desactivado"
  - login con suscripción expirada → error "suscripción expirada"
  - login con todo activo → éxito
```

---

## Rollback

Si algo falla en producción, el cambio más seguro de revertir es:

1. Revertir `calculateLockStatus` para que solo evalúe `tokenBalance <= 0` (estado original)
2. El resto de los cambios son aditivos (nuevos campos, nuevos mensajes) y no rompen nada

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `refreshAccessToken` no tiene include de `tenant.plan` | Verificar antes de implementar, agregar include |
| Polling cada 60s genera carga en el servidor | Endpoint `/auth/me` ya existe y es liviano; 1 req/min por usuario es despreciable |
| `lockReason` no llega al renderer por IPC | Probar flujo completo Login → App → Bloqueo antes de deploy |
| Admin reactiva suscripción pero `lockReason` queda en cache | Polling actualiza cada 60s; si es urgente, usuario re-loguea |
