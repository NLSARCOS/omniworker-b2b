"use client";

import React, { useState } from "react";

export function ContactForm({ source, targetName }: { source: string; targetName: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const companySize = (form.elements.namedItem("company_size") as HTMLSelectElement).value;
    const useCase = (form.elements.namedItem("use_case") as HTMLTextAreaElement).value;

    try {
      const res = await fetch("/api/v1/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          companySize,
          useCase,
          source,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("success");
        form.reset();
      } else {
        setStatus("error");
        setErrorMessage(data.error || "Ocurrió un error al enviar el formulario");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Error de red. Por favor, intenta de nuevo.");
    }
  };

  return (
    <div style={{ background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: 12, padding: 32, boxShadow: "6px 6px 0 var(--ink)" }}>
      {status === "success" ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>¡Solicitud Recibida!</h3>
          <p style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.6 }}>
            Te hemos enviado la documentación técnica para inicializar tu Edge Agent en menos de 5 minutos.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Nombre Completo</label>
            <input
              type="text"
              name="name"
              required
              placeholder="Ej. Juan Pérez"
              disabled={status === "submitting"}
              style={{ background: "white", border: "1.5px solid var(--rule)", padding: "12px 16px", borderRadius: 8, fontSize: 14.5, color: "var(--ink)", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Correo Corporativo</label>
            <input
              type="email"
              name="email"
              required
              placeholder="Ej. juan@empresa.com"
              disabled={status === "submitting"}
              style={{ background: "white", border: "1.5px solid var(--rule)", padding: "12px 16px", borderRadius: 8, fontSize: 14.5, color: "var(--ink)", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Tamaño de la Empresa</label>
            <select
              name="company_size"
              disabled={status === "submitting"}
              style={{ background: "white", border: "1.5px solid var(--rule)", padding: "12px 16px", borderRadius: 8, fontSize: 14.5, color: "var(--ink)", outline: "none", cursor: "pointer" }}
            >
              <option value="1-10">1 a 10 empleados</option>
              <option value="11-50">11 a 50 empleados</option>
              <option value="51-200">51 a 200 empleados</option>
              <option value="200+">Más de 200 empleados</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>¿Qué buscas automatizar?</label>
            <textarea
              name="use_case"
              rows={3}
              required
              disabled={status === "submitting"}
              placeholder={`Describe brevemente tu flujo de ${targetName}...`}
              style={{ background: "white", border: "1.5px solid var(--rule)", padding: "12px 16px", borderRadius: 8, fontSize: 14.5, color: "var(--ink)", outline: "none", resize: "none" }}
            />
          </div>

          {status === "error" && (
            <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: 6 }}>
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            style={{
              background: "var(--neon)",
              color: "var(--ink)",
              border: "none",
              padding: "14px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14.5,
              cursor: status === "submitting" ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
              opacity: status === "submitting" ? 0.7 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {status === "submitting" ? "Enviando solicitud..." : "Enviar Solicitud →"}
          </button>
        </form>
      )}
    </div>
  );
}
