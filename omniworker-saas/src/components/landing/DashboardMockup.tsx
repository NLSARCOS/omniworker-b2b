"use client";

import React from "react";
import { useReducedMotion } from "./useReducedMotion";

interface DashboardMockupProps {
  className?: string;
}

const navItems = [
  { icon: "◆", label: "Agentes", active: true },
  { icon: "▶", label: "Ejecuciones", active: false },
  { icon: "◇", label: "Integraciones", active: false },
  { icon: "▸", label: "Logs", active: false },
];

const agents = [
  {
    name: "CodeReviewer",
    id: "agent_7xK9mP2L",
    ops: "12.4K",
    status: "Activo",
  },
  {
    name: "DocWriter",
    id: "agent_3vQ8nR5W",
    ops: "8.2K",
    status: "Activo",
  },
  {
    name: "TestRunner",
    id: "agent_9yJ4bT7H",
    ops: "24.1K",
    status: "Activo",
  },
];

export default function DashboardMockup({ className = "" }: DashboardMockupProps) {
  const reduced = useReducedMotion();

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        backgroundColor: "#0f0f0f",
        boxShadow:
          "0 25px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,168,83,0.08), 0 0 60px -10px rgba(212,168,83,0.05)",
      }}
    >
      {/* Scanline effect */}
      <div
        className="absolute inset-0 pointer-events-none z-30"
        style={{ opacity: 0.05 }}
      >
        <div
          className="w-full h-px bg-white"
          style={{
            animation: reduced ? "none" : "scanline 8s linear infinite",
          }}
        />
      </div>

      {/* Top bar */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{
          backgroundColor: "#0a0a0a",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="ml-3 text-xs text-neutral-500 font-mono tracking-wide">
          omniworker-dashboard
        </span>
        <div className="ml-auto flex items-center gap-3">
          {/* Data flow lines */}
          <div className="hidden sm:flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-16 h-px relative overflow-hidden"
                style={{ backgroundColor: "rgba(212,168,83,0.15)" }}
              >
                <div
                  className="absolute top-0 left-0 w-2 h-full rounded-full"
                  style={{
                    backgroundColor: "#D4A853",
                    opacity: 0.6,
                    animation: reduced
                      ? "none"
                      : `dataFlow 2s linear infinite`,
                    animationDelay: reduced ? "0s" : `${i * 0.6}s`,
                  }}
                />
              </div>
            ))}
          </div>
          <div
            className="w-6 h-6 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
          />
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div
          className="hidden sm:flex flex-col w-48 py-4 px-3 gap-0.5 border-r shrink-0"
          style={{
            backgroundColor: "#0a0a0a",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          {navItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors"
              style={{
                color: item.active ? "#D4A853" : "rgba(255,255,255,0.4)",
                backgroundColor: item.active
                  ? "rgba(212,168,83,0.08)"
                  : "transparent",
              }}
            >
              <span className="text-[10px] opacity-60">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>

        {/* Main area */}
        <div className="flex-1 p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Agentes Activos
            </h3>
            <span className="text-[10px] text-neutral-500 font-mono">
              3 running
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "rgba(212,168,83,0.1)" }}
                >
                  <span className="text-xs text-amber-400">◆</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono truncate">
                    {agent.id}
                  </div>
                </div>
                <div className="hidden sm:block text-[10px] text-neutral-500 font-mono">
                  {agent.ops} ops
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: "#22c55e",
                      animation: reduced
                        ? "none"
                        : "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    }}
                  />
                  <span className="text-[10px] text-green-400 font-medium">
                    {agent.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scanline {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(400px);
          }
        }
        @keyframes dataFlow {
          0% {
            transform: translateX(-8px);
            opacity: 0;
          }
          20% {
            opacity: 0.6;
          }
          80% {
            opacity: 0.6;
          }
          100% {
            transform: translateX(66px);
            opacity: 0;
          }
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
